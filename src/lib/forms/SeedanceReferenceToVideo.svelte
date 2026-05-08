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
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import {
    SEEDANCE_R2V_TIERS,
    SEEDANCE_DEFAULT_TIER,
    type SeedanceTier
  } from '$lib/seedance-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImageSlot = { file: File | null; preview: string | null; url: string | null };
  type AspectRatio = 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  type Resolution = '480p' | '720p' | '1080p';

  function emptyImage(): ImageSlot { return { file: null, preview: null, url: null }; }

  function readTierFromUrl(): SeedanceTier {
    const t = page.url.searchParams.get('tier');
    return SEEDANCE_R2V_TIERS.some((x) => x.value === t)
      ? (t as SeedanceTier)
      : (SEEDANCE_R2V_TIERS.some((x) => x.value === SEEDANCE_DEFAULT_TIER)
          ? SEEDANCE_DEFAULT_TIER
          : SEEDANCE_R2V_TIERS[0].value);
  }

  let tier = $state<SeedanceTier>(readTierFromUrl());

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      replaceState(url, page.state);
    }
  });

  const tierMeta = $derived(SEEDANCE_R2V_TIERS.find((t) => t.value === tier)!);

  let prompt = $state('');
  let imageRefs = $state<ImageSlot[]>([emptyImage()]);
  let duration = $state<number>(5);
  let durationAuto = $state(true);
  let resolution = $state<Resolution>('720p');
  let aspectRatio = $state<AspectRatio>('auto');
  let generateAudio = $state(true);
  let cameraFixed = $state(false);
  let safetyChecker = $state(true);
  let seed = $state<string>('');
  let advancedOpen = $state(false);
  let lastFocused = $state<HTMLTextAreaElement | null>(null);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo imágenes...', submitting: 'Enviando trabajo...',
    polling: 'Generando video...', done: '¡Listo!', error: 'Error'
  };

  const endpointPath = '/api/seedance/reference-to-video';

  // Ajustar resolution si la tier no la soporta
  $effect(() => {
    if (!tierMeta.resolutions.includes(resolution)) {
      resolution = tierMeta.resolutions[tierMeta.resolutions.length - 1];
    }
  });

  // Ajustar duration al rango de la familia
  const durationMin = $derived(tierMeta.family === 'v2' ? 4 : 2);
  const durationMax = $derived(tierMeta.family === 'v2' ? 15 : 12);
  $effect(() => {
    if (duration < durationMin) duration = durationMin;
    if (duration > durationMax) duration = durationMax;
  });

  // Max images depende de la familia (v2 = 9, v1 lite = 4)
  const maxImages = $derived(tierMeta.family === 'v2' ? 9 : 4);

  const ALL_ENDPOINTS = SEEDANCE_R2V_TIERS
    .map((t) => t.endpoints.r2v)
    .filter((e): e is string => e !== null);
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m)); });
  const currentEndpointModel = $derived(tierMeta.endpoints.r2v);
  const unitPrice = $derived(currentEndpointModel ? priceMap[currentEndpointModel]?.unit_price ?? null : null);
  const effectiveDuration = $derived(durationAuto && tierMeta.family === 'v2' ? 5 : duration);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: 'auto', label: 'Auto', w: 28, h: 24 },
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 },
    { value: '4:3', label: '4:3', w: 32, h: 24 },
    { value: '3:4', label: '3:4', w: 24, h: 32 },
    { value: '21:9', label: '21:9', w: 42, h: 18 }
  ];

  const resolutionOptions = $derived(
    tierMeta.resolutions.map((r) => ({ value: r, label: r }))
  );

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }
  function setImage(slot: ImageSlot, file: File): ImageSlot {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function addImageRef() { if (imageRefs.length < maxImages) imageRefs.push(emptyImage()); }
  function removeImageRef(i: number) {
    if (imageRefs[i].preview) URL.revokeObjectURL(imageRefs[i].preview!);
    imageRefs.splice(i, 1);
    if (imageRefs.length === 0) imageRefs.push(emptyImage());
  }

  function insertChip(text: string) {
    const ta = lastFocused; if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length); });
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    const filledRefs = imageRefs.filter((r) => r.file || r.url);
    if (filledRefs.length === 0) { errorMessage = 'Necesitas al menos una imagen de referencia.'; phase = 'error'; return; }
    if (filledRefs.length > maxImages) {
      errorMessage = `Máximo ${maxImages} imágenes para esta versión.`;
      phase = 'error'; return;
    }

    reset();
    try {
      phase = 'uploading';
      for (let i = 0; i < imageRefs.length; i++) {
        if (!imageRefs[i].url && imageRefs[i].file) imageRefs[i].url = await uploadFile(imageRefs[i].file!);
      }
      const urls = imageRefs.filter((r) => r.url).map((r) => r.url!);

      const payload: Record<string, unknown> = {
        tier,
        family: tierMeta.family,
        prompt: prompt.trim(),
        resolution,
        aspect_ratio: aspectRatio
      };
      if (tierMeta.family === 'v2') {
        payload.image_urls = urls;
        if (tierMeta.family === 'v2' && durationAuto) payload.duration = 'auto';
        else payload.duration = duration;
        payload.generate_audio = generateAudio;
      } else {
        payload.reference_image_urls = urls;
        payload.duration = duration;
        payload.camera_fixed = cameraFixed;
        payload.enable_safety_checker = safetyChecker;
      }

      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum)) payload.seed = seedNum;

      phase = 'submitting';
      const subRes = await fetch(`${endpointPath}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${endpointPath}/status?id=${encodeURIComponent(request_id)}&tier=${encodeURIComponent(tier)}`);
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
    imageRefs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
  });
</script>

<BackButton href="/seedance" label="Seedance" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Seedance - Reference to Video
</h1>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="tier-row">
    <Dropdown
      bind:value={tier}
      options={SEEDANCE_R2V_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Versión:"
      disabled={isRunning}
    />
  </div>

  <p class="intro">
    Combina hasta {maxImages} imágenes de referencia. En el prompt puedes referirlas como
    <code>@Image1</code>, <code>@Image2</code>, etc.
  </p>

  <ChipGroup
    bind:value={resolution}
    options={resolutionOptions}
    label="Resolución:"
    disabled={isRunning}
  />

  <AspectRatioPicker
    bind:value={aspectRatio}
    options={aspectOptions}
    disabled={isRunning}
  />

  {#if imageRefs.some((r) => r.file || r.url)}
    <div class="chips" transition:slide={{ duration: 200 }}>
      <span class="chips-label">Insertar:</span>
      {#each imageRefs as r, i}
        {#if r.file || r.url}
          <button type="button" class="chip" onclick={() => insertChip(`@Image${i + 1}`)} disabled={isRunning}>@Image{i + 1}</button>
        {/if}
      {/each}
    </div>
  {/if}

  <Prompt
    bind:value={prompt}
    placeholder="Describe la escena. Usa @Image1, @Image2..."
    rows={6}
    disabled={isRunning}
    onfocusEvent={(e) => (lastFocused = e.currentTarget)}
  />

  <Collapsible bind:open={advancedOpen} title="Imágenes de referencia" icon="🖼️">
    <p class="help">
      Hasta {maxImages} imágenes. Las refieres en el prompt como <code>@Image1</code>, <code>@Image2</code>, etc.
    </p>
    <div class="grid">
      {#each imageRefs as r, i (i)}
        <div class="ref-card" transition:slide={{ duration: 200 }}>
          <span class="ref-tag">@Image{i + 1}</span>
          <label class="image-square" class:filled={!!r.preview}>
            <input type="file" accept="image/*" disabled={isRunning} onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) imageRefs[i] = setImage(r, f);
            }} />
            {#if r.preview}<img src={r.preview} alt={`image ${i + 1}`} />{:else}<span class="big">+</span>{/if}
          </label>
          <button type="button" class="ref-remove" aria-label="Quitar" onclick={() => removeImageRef(i)} disabled={isRunning}>×</button>
        </div>
      {/each}
      <button type="button" class="add-card" onclick={addImageRef} disabled={isRunning || imageRefs.length >= maxImages}>+ Imagen</button>
    </div>
  </Collapsible>

  {#if tierMeta.family === 'v2'}
    <Switch
      bind:checked={durationAuto}
      label="🤖 Duración automática"
      disabled={isRunning}
    />
  {/if}

  {#if !(tierMeta.family === 'v2' && durationAuto)}
    <Slider
      bind:value={duration}
      min={durationMin}
      max={durationMax}
      label="Duración"
      suffix="s"
      disabled={isRunning}
    />
  {/if}

  {#if tierMeta.family === 'v2'}
    <Switch
      bind:checked={generateAudio}
      label="🔊 Generar audio sincronizado"
      disabled={isRunning}
    />
  {/if}

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <label class="field-label" for="seed-r2v">Seed (opcional, -1 = aleatorio)</label>
      <input id="seed-r2v" type="number" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
    </div>
    {#if tierMeta.family === 'v1'}
      <Switch bind:checked={cameraFixed} label="📷 Fijar cámara" disabled={isRunning} />
      <Switch bind:checked={safetyChecker} label="🛡️ Safety checker" disabled={isRunning} />
    {/if}
  </Collapsible>

  <CostEstimate {unitPrice} duration={effectiveDuration} />

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
  .intro code { padding: 0.1rem 0.4rem; background: var(--surface-pill); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chips-label { color: var(--text-muted); font-size: 0.85rem; margin-right: 0.25rem; }
  .chip {
    padding: 0.3rem 0.7rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.85rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .chip:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-1px); box-shadow: var(--accent-shadow); }

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

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .seed-input {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .seed-input:focus { border-color: var(--accent); }
  .seed-input::placeholder { color: var(--text-muted); font-family: var(--font-sans); }

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
