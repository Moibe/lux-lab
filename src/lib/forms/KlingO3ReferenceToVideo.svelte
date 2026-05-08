<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import RichElementsList from '$lib/form/RichElementsList.svelte';
  import type { RichElement } from '$lib/form/RichElementsList.svelte';
  import { O3_TIERS, O3_DEFAULT_TIER, type O3Tier } from '$lib/kling-o3-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type Shot = { prompt: string; duration: number };

  let { title, backHref, backLabel }: {
    title: string;
    backHref: string;
    backLabel: string;
  } = $props();

  function readTierFromUrl(): O3Tier {
    const t = page.url.searchParams.get('tier');
    return O3_TIERS.some((x) => x.value === t) ? (t as O3Tier) : O3_DEFAULT_TIER;
  }

  let tier = $state<O3Tier>(readTierFromUrl());

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      replaceState(url, page.state);
    }
  });

  const endpointPath = $derived(`/api/kling/o3/reference-to-video-${tier}`);

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }

  let startImage = $state<ImgState>(emptyImage());
  let endImage = $state<ImgState>(emptyImage());
  let prompt = $state('');
  let multiShotMode = $state(false);
  let shots = $state<Shot[]>([{ prompt: '', duration: 8 }]);
  let duration = $state(8);
  let generateAudio = $state(true);
  let imageRefs = $state<ImgState[]>([]);
  let elements = $state<RichElement[]>([]);
  let imagesOpen = $state(false);
  let elementsOpen = $state(false);
  let lastFocused = $state<HTMLTextAreaElement | null>(null);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo media...', submitting: 'Enviando trabajo...',
    polling: 'Generando video...', done: '¡Listo!', error: 'Error'
  };
  const totalShotDuration = $derived(shots.reduce((s, sh) => s + sh.duration, 0));

  const ALL_ENDPOINTS = [
    'fal-ai/kling-video/o3/4k/reference-to-video',
    'fal-ai/kling-video/o3/pro/reference-to-video',
    'fal-ai/kling-video/o3/standard/reference-to-video'
  ];
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const currentEndpointModel = $derived(`fal-ai/kling-video/o3/${tier}/reference-to-video`);
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);
  const totalDuration = $derived(multiShotMode ? totalShotDuration : duration);
  const hasStartImage = $derived(!!startImage.file);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }
  function setImageInSlot(slot: ImgState, file: File): ImgState {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function addImageRef() { imageRefs.push(emptyImage()); }
  function removeImageRef(i: number) {
    if (imageRefs[i].preview) URL.revokeObjectURL(imageRefs[i].preview!);
    imageRefs.splice(i, 1);
  }

  function insertChip(text: string) {
    const ta = lastFocused; if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length); });
  }

  function addShot() { shots.push({ prompt: '', duration: 8 }); }
  function removeShot(i: number) { if (shots.length > 1) shots.splice(i, 1); }
  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (multiShotMode) {
      if (shots.some((s) => !s.prompt.trim())) { errorMessage = 'Cada shot necesita un prompt.'; phase = 'error'; return; }
    } else if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    if (imageRefs.some((r) => !r.file)) { errorMessage = 'Cada @Image necesita archivo.'; phase = 'error'; return; }
    if (elements.some((el) => !el.frontal.file)) { errorMessage = 'Cada elemento necesita imagen frontal.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (startImage.file && !startImage.url) startImage.url = await uploadFile(startImage.file);
      if (endImage.file && !endImage.url) endImage.url = await uploadFile(endImage.file);
      for (let i = 0; i < imageRefs.length; i++) {
        if (!imageRefs[i].url && imageRefs[i].file) imageRefs[i].url = await uploadFile(imageRefs[i].file!);
      }
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el.frontal.url && el.frontal.file) el.frontal.url = await uploadFile(el.frontal.file);
        for (let j = 0; j < el.refs.length; j++) {
          if (!el.refs[j].url && el.refs[j].file) el.refs[j].url = await uploadFile(el.refs[j].file!);
        }
      }

      const payload: Record<string, unknown> = { generate_audio: generateAudio };
      if (startImage.url) payload.start_image_url = startImage.url;
      if (endImage.url) payload.end_image_url = endImage.url;
      if (multiShotMode) {
        payload.multi_prompt = shots.map((s) => ({ prompt: s.prompt.trim(), duration: s.duration }));
      } else {
        payload.prompt = prompt.trim();
        payload.duration = duration;
      }
      if (imageRefs.length > 0) payload.image_urls = imageRefs.map((r) => r.url!);
      if (elements.length > 0) {
        payload.elements = elements.map((el) => ({
          frontal_image_url: el.frontal.url!,
          ...(el.refs.length > 0 ? { reference_image_urls: el.refs.map((r) => r.url!) } : {}),
          ...(el.voiceId.trim() ? { voice_id: el.voiceId.trim() } : {})
        }));
      }

      phase = 'submitting';
      const subRes = await fetch(`${endpointPath}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${endpointPath}/status?id=${encodeURIComponent(request_id)}`);
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        if (data.status === 'COMPLETED') { videoUrl = data.result?.video?.url ?? null; phase = 'done'; return; }
        pollTimer = setTimeout(poll, 3000);
      };
      poll();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      phase = 'error';
    }
  }

  $effect(() => () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (startImage.preview) URL.revokeObjectURL(startImage.preview);
    if (endImage.preview) URL.revokeObjectURL(endImage.preview);
    imageRefs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
    elements.forEach((el) => {
      if (el.frontal.preview) URL.revokeObjectURL(el.frontal.preview);
      el.refs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
    });
  });
</script>

<BackButton href={backHref} label={backLabel} />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>{title}</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="tier-row">
    <Dropdown
      bind:value={tier}
      options={O3_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Calidad:"
      disabled={isRunning}
    />
  </div>

  <p class="intro">Combina imágenes, elementos y texto para mantener consistencia de personajes y escenas.</p>

  <div class="image-row">
    <ImageSlot
      bind:state={startImage}
      disabled={isRunning}
      placeholder="Imagen inicial"
      placeholderHint="(opcional)"
      minHeight="9rem"
    />
    {#if hasStartImage}
      <span class="arrow" aria-hidden="true">→</span>
      <ImageSlot
        bind:state={endImage}
        disabled={isRunning}
        placeholder="Imagen final"
        placeholderHint="(opcional)"
        optional
        minHeight="9rem"
      />
    {/if}
  </div>

  <Switch bind:checked={multiShotMode} label="🎬 Modo cinematográfico (multi-shot)" disabled={isRunning} />

  {#if (imageRefs.length > 0 && imageRefs.some((r) => r.url || r.file)) || elements.length > 0}
    <div class="chips" transition:slide={{ duration: 200 }}>
      <span class="chips-label">Insertar:</span>
      {#each imageRefs as r, i}
        {#if r.file || r.url}<button type="button" class="chip" onclick={() => insertChip(`@Image${i + 1}`)} disabled={isRunning}>@Image{i + 1}</button>{/if}
      {/each}
      {#each elements as _, i}
        <button type="button" class="chip element-chip" onclick={() => insertChip(`@Element${i + 1}`)} disabled={isRunning}>@Element{i + 1}</button>
      {/each}
    </div>
  {/if}

  {#if !multiShotMode}
    <div transition:slide={{ duration: 200 }}>
      <Prompt
        bind:value={prompt}
        placeholder="Describe la escena. Usa @Image1, @Element1..."
        rows={6}
        disabled={isRunning}
        onfocusEvent={(e) => (lastFocused = e.currentTarget)}
      />
      <div class="duration-row">
        <Slider bind:value={duration} min={3} max={15} label="Duración" suffix="s" disabled={isRunning} />
      </div>
    </div>
  {:else}
    <div class="shots" transition:slide={{ duration: 200 }}>
      {#each shots as shot, i (i)}
        <div class="shot-card" transition:slide={{ duration: 200 }}>
          <div class="shot-head">
            <span class="shot-num">Shot {i + 1}</span>
            {#if shots.length > 1}<button type="button" class="shot-remove" aria-label="Quitar" onclick={() => removeShot(i)} disabled={isRunning}>×</button>{/if}
          </div>
          <Prompt
            bind:value={shots[i].prompt}
            placeholder={`Shot ${i + 1}...`}
            rows={3}
            small
            disabled={isRunning}
            onfocusEvent={(e) => (lastFocused = e.currentTarget)}
          />
          <Slider bind:value={shots[i].duration} min={1} max={15} label="Duración" suffix="s" disabled={isRunning} />
        </div>
      {/each}
      <button type="button" class="add-shot" onclick={addShot} disabled={isRunning}>+ Añadir shot</button>
      <p class="total-time">Total: <strong>{totalShotDuration}s</strong></p>
    </div>
  {/if}

  <Switch bind:checked={generateAudio} label="🔊 Audio nativo (ES / EN)" disabled={isRunning} />

  <Collapsible bind:open={imagesOpen} title="Imágenes referenciadas (@Image)" icon="🖼️">
    <p class="help">Hasta 10 imágenes. Las refieres en el prompt como <code>@Image1</code>, <code>@Image2</code>, etc.</p>
    <div class="grid">
      {#each imageRefs as r, i (i)}
        <div class="ref-card" transition:slide={{ duration: 200 }}>
          <span class="ref-tag">@Image{i + 1}</span>
          <label class="image-square" class:filled={!!r.preview}>
            <input type="file" accept="image/*" disabled={isRunning} onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) imageRefs[i] = setImageInSlot(r, f);
            }} />
            {#if r.preview}<img src={r.preview} alt={`image ${i + 1}`} />{:else}<span class="big">+</span>{/if}
          </label>
          <button type="button" class="ref-remove" aria-label="Quitar" onclick={() => removeImageRef(i)} disabled={isRunning}>×</button>
        </div>
      {/each}
      <button type="button" class="add-card" onclick={addImageRef} disabled={isRunning || imageRefs.length >= 10}>+ Imagen</button>
    </div>
  </Collapsible>

  <Collapsible bind:open={elementsOpen} title="Elementos referenciados (@Element)" icon="🧩">
    <p class="help">
      Cada elemento: <strong>imagen frontal</strong> (principal) + opcionalmente <strong>referencias</strong> de estilo/apariencia. Posicional: <code>@Element1</code> = el primero en la lista.
    </p>
    <RichElementsList bind:elements disabled={isRunning} voiceIdMode="enabled" />
  </Collapsible>

  <CostEstimate {unitPrice} duration={totalDuration} audio={generateAudio} />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel
    {phase}
    phaseLabel={phaseLabel[phase]}
    {errorMessage}
    {logs}
    resultUrl={videoUrl}
  />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .tier-row { display: flex; justify-content: flex-start; }
  .intro { margin: 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; }

  .image-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center; }
  .arrow { color: var(--text-muted); font-size: 1.5rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chips-label { color: var(--text-muted); font-size: 0.85rem; margin-right: 0.25rem; }
  .chip {
    padding: 0.3rem 0.7rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.85rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .chip:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-1px); box-shadow: var(--accent-shadow); }
  .chip.element-chip { border-color: rgba(168, 85, 247, 0.3); }

  .duration-row { margin-top: 1rem; }

  .shots { display: flex; flex-direction: column; gap: 1rem; }
  .shot-card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
  .shot-head { display: flex; justify-content: space-between; align-items: center; }
  .shot-num { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em; }
  .shot-remove {
    width: 28px; height: 28px; background: transparent; border: var(--border-subtle); border-radius: 50%;
    color: var(--text-muted); font-size: 1.1rem; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .shot-remove:hover:not(:disabled) { color: #fca5a5; border-color: #fca5a5; }
  .add-shot {
    padding: 0.65rem 1rem; background: transparent; border: 1px dashed rgba(255,255,255,0.2);
    border-radius: var(--radius-card); color: var(--text-muted); font-family: var(--font-sans); font-size: 0.9rem; cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-shot:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }
  .total-time { margin: 0; color: var(--text-muted); font-size: 0.9rem; text-align: right; }
  .total-time strong { color: var(--text-primary); }

  .help { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; }
  .help code { padding: 0.1rem 0.4rem; background: var(--surface-pill); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; }
  .ref-card { position: relative; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-card); }
  .ref-tag { display: inline-block; padding: 0.15rem 0.5rem; background: rgba(37,99,235,0.2); border: 1px solid rgba(37,99,235,0.4); border-radius: 6px; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; align-self: flex-start; }
  .image-square {
    position: relative; aspect-ratio: 1; background: #fff;
    border: 1.5px dashed #000; border-radius: 8px; overflow: hidden; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .image-square.filled { border-style: solid; }
  .image-square input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .image-square img { width: 100%; height: 100%; object-fit: cover; }
  .image-square .big { font-size: 1.5rem; color: rgba(0, 0, 0, 0.55); font-weight: 300; }
  .ref-remove {
    position: absolute; top: 0.3rem; right: 0.3rem; width: 22px; height: 22px;
    background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%;
    font-size: 0.9rem; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .ref-remove:hover:not(:disabled) { background: rgba(0,0,0,0.85); }
  .add-card {
    display: flex; align-items: center; justify-content: center; min-height: 120px;
    padding: 0.65rem; background: transparent; border: 1px dashed rgba(255,255,255,0.2);
    border-radius: var(--radius-card); color: var(--text-muted); font-family: var(--font-sans); font-size: 0.9rem; cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-card:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }
  .add-card:disabled { opacity: 0.4; cursor: not-allowed; }

  .submit {
    margin-top: 0.5rem; padding: 0.95rem 1.5rem;
    background: var(--accent); color: var(--text-primary); border: none;
    border-radius: var(--radius-pill); font-family: var(--font-sans); font-size: 1.05rem; font-weight: 600;
    cursor: pointer; box-shadow: var(--accent-shadow);
    transition: filter var(--transition-fast), transform var(--transition-fast);
  }
  .submit:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
  .submit:disabled { opacity: 0.7; cursor: not-allowed; }
</style>
