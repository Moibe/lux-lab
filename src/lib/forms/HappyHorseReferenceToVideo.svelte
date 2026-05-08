<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type Resolution = '720p' | '1080p';
  type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

  let { endpointPath, title, backHref, backLabel }: {
    endpointPath: string;
    title: string;
    backHref: string;
    backLabel: string;
  } = $props();

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }

  let prompt = $state('');
  let images = $state<ImgState[]>([emptyImage()]);
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<Resolution>('1080p');
  let duration = $state(5);
  let seed = $state<string>('');
  let safetyChecker = $state(true);
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

  const ENDPOINT_MODEL = 'alibaba/happy-horse/reference-to-video';
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap([ENDPOINT_MODEL]).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[ENDPOINT_MODEL]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 },
    { value: '4:3', label: '4:3', w: 32, h: 24 },
    { value: '3:4', label: '3:4', w: 24, h: 32 }
  ];

  const resolutionOptions: { value: Resolution; label: string }[] = [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' }
  ];

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }
  function setImage(slot: ImgState, file: File): ImgState {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function addImage() { if (images.length < 9) images.push(emptyImage()); }
  function removeImage(i: number) {
    if (images[i].preview) URL.revokeObjectURL(images[i].preview!);
    images.splice(i, 1);
    if (images.length === 0) images.push(emptyImage());
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
    const filledImages = images.filter((img) => img.file);
    if (filledImages.length === 0) { errorMessage = 'Sube al menos 1 imagen de referencia.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      for (let i = 0; i < images.length; i++) {
        if (!images[i].url && images[i].file) images[i].url = await uploadFile(images[i].file!);
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        image_urls: images.filter((img) => img.url).map((img) => img.url!),
        aspect_ratio: aspectRatio,
        resolution,
        duration,
        enable_safety_checker: safetyChecker
      };
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

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
    images.forEach((img) => { if (img.preview) URL.revokeObjectURL(img.preview); });
  });
</script>

<BackButton href={backHref} label={backLabel} />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>{title}</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Sube hasta 9 imágenes de referencia. Refiérelas en el prompt como <code>character1</code>, <code>character2</code>...
    <em>(convención propia de Happy Horse — sin @ y minúsculas)</em>
  </p>

  <div class="grid">
    {#each images as img, i (i)}
      <div class="ref-card" transition:slide={{ duration: 200 }}>
        <span class="ref-tag">character{i + 1}</span>
        <label class="image-square" class:filled={!!img.preview}>
          <input type="file" accept="image/*" disabled={isRunning} onchange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) images[i] = setImage(img, f);
          }} />
          {#if img.preview}<img src={img.preview} alt={`character${i + 1}`} />{:else}<span class="big">+</span>{/if}
        </label>
        {#if images.length > 1 || img.file}
          <button type="button" class="ref-remove" aria-label="Quitar" onclick={() => removeImage(i)} disabled={isRunning}>×</button>
        {/if}
      </div>
    {/each}
    {#if images.length < 9}
      <button type="button" class="add-card" onclick={addImage} disabled={isRunning}>+ Imagen</button>
    {/if}
  </div>

  {#if images.some((img) => img.file)}
    <div class="chips" transition:slide={{ duration: 200 }}>
      <span class="chips-label">Insertar:</span>
      {#each images as img, i}
        {#if img.file}
          <button type="button" class="chip" onclick={() => insertChip(`character${i + 1}`)} disabled={isRunning}>character{i + 1}</button>
        {/if}
      {/each}
    </div>
  {/if}

  <Prompt
    bind:value={prompt}
    placeholder="Describe la escena. Usa character1, character2..."
    rows={6}
    maxlength={2500}
    disabled={isRunning}
    onfocusEvent={(e) => (lastFocused = e.currentTarget)}
  />

  <AspectRatioPicker
    bind:value={aspectRatio}
    options={aspectOptions}
    disabled={isRunning}
  />

  <ChipGroup
    bind:value={resolution}
    options={resolutionOptions}
    label="Resolución:"
    disabled={isRunning}
  />

  <Slider bind:value={duration} min={3} max={15} label="Duración" suffix="s" disabled={isRunning} />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <label class="field-label" for="seed">Seed (opcional)</label>
      <input id="seed" type="number" min="0" max="2147483647" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
    </div>
    <Switch bind:checked={safetyChecker} label="🛡️ Safety checker" disabled={isRunning} />
  </Collapsible>

  <CostEstimate {unitPrice} {duration} />

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
  .intro { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.55; }
  .intro code { padding: 0.1rem 0.4rem; background: var(--surface-pill); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
  .intro em { font-style: normal; color: rgba(252,165,165,0.7); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; }
  .ref-card { position: relative; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-card); }
  .ref-tag {
    display: inline-block; padding: 0.15rem 0.5rem;
    background: rgba(236, 72, 153, 0.2); border: 1px solid rgba(236, 72, 153, 0.4);
    border-radius: 6px; color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem;
    align-self: flex-start;
  }
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

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chips-label { color: var(--text-muted); font-size: 0.85rem; margin-right: 0.25rem; }
  .chip {
    padding: 0.3rem 0.7rem; background: var(--surface-pill); border: 1px solid rgba(236, 72, 153, 0.3);
    border-radius: var(--radius-pill); color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .chip:hover:not(:disabled) { background: rgba(236, 72, 153, 0.3); color: #fff; transform: translateY(-1px); }

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
