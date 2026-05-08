<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import { TRANSITION_VERSIONS, PIXVERSE_STYLES, type PixVerseVersion, type PixVerseStyle } from '$lib/pixverse-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type Resolution = '360p' | '540p' | '720p' | '1080p';
  type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

  let version = $state<PixVerseVersion>('v6');
  let firstImage = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let endImage = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<Resolution>('720p');
  let duration = $state(5);
  let style = $state<'' | PixVerseStyle>('');
  let negativePrompt = $state('');
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo imágenes...', submitting: 'Enviando trabajo...',
    polling: 'Generando transición...', done: '¡Listo!', error: 'Error'
  };

  const supportsAspect = $derived(version !== 'v4.5');
  const endpointPath = $derived(`/api/pixverse/${version}/transition`);
  const currentEndpointModel = $derived(`fal-ai/pixverse/${version}/transition`);

  const ALL_ENDPOINTS = TRANSITION_VERSIONS.map((v) => `fal-ai/pixverse/${v.value}/transition`);
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 },
    { value: '4:3', label: '4:3', w: 32, h: 24 },
    { value: '3:4', label: '3:4', w: 24, h: 32 }
  ];
  const resOptions: { value: Resolution; label: string }[] = [
    { value: '360p', label: '360p' },
    { value: '540p', label: '540p' },
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

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!firstImage.file) { errorMessage = 'Sube imagen inicial.'; phase = 'error'; return; }
    if (!endImage.file) { errorMessage = 'Sube imagen final.'; phase = 'error'; return; }
    if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (!firstImage.url && firstImage.file) firstImage.url = await uploadFile(firstImage.file);
      if (!endImage.url && endImage.file) endImage.url = await uploadFile(endImage.file);

      const payload: Record<string, unknown> = {
        first_image_url: firstImage.url,
        end_image_url: endImage.url,
        prompt: prompt.trim(),
        resolution,
        duration
      };
      if (supportsAspect) payload.aspect_ratio = aspectRatio;
      if (style) payload.style = style;
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
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
    if (firstImage.preview) URL.revokeObjectURL(firstImage.preview);
    if (endImage.preview) URL.revokeObjectURL(endImage.preview);
  });
</script>

<BackButton href="/pixverse" label="PixVerse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  PixVerse - Transition
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="version-row">
    <Dropdown
      bind:value={version}
      options={TRANSITION_VERSIONS.map((v) => ({ value: v.value, label: v.label, hint: v.hint }))}
      label="Versión:"
      disabled={isRunning}
    />
  </div>

  <div class="image-row">
    <div class="slot-wrap">
      <ImageSlot bind:state={firstImage} disabled={isRunning} placeholder="Imagen inicial" />
    </div>
    <span class="arrow" aria-hidden="true">→</span>
    <div class="slot-wrap">
      <ImageSlot bind:state={endImage} disabled={isRunning} placeholder="Imagen final" />
    </div>
  </div>

  <Prompt bind:value={prompt} placeholder="Describe la transición entre las dos imágenes..." rows={4} disabled={isRunning} small />

  <ChipGroup bind:value={resolution} options={resOptions} label="Resolución:" disabled={isRunning} />

  {#if supportsAspect}
    <AspectRatioPicker bind:value={aspectRatio} options={aspectOptions} label="Formato:" disabled={isRunning} />
  {/if}

  <Slider bind:value={duration} min={1} max={15} label="Duración" suffix="s" disabled={isRunning} />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <label class="field-label" for="style">Estilo</label>
      <select id="style" bind:value={style} class="select" disabled={isRunning}>
        {#each PIXVERSE_STYLES as s}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <label class="field-label" for="neg">Prompt negativo</label>
      <Prompt bind:value={negativePrompt} placeholder="" rows={2} disabled={isRunning} small />
    </div>
    <div class="field">
      <label class="field-label" for="seed">Seed (opcional)</label>
      <input id="seed" type="number" min="0" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
    </div>
  </Collapsible>

  <CostEstimate {unitPrice} {duration} />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .version-row { display: flex; justify-content: flex-start; }

  .image-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; }
  .slot-wrap { flex: 1; min-width: 12rem; display: flex; }
  .slot-wrap > :global(.image-slot) { flex: 1; }
  .arrow { color: var(--text-muted); font-size: 1.5rem; align-self: center; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .seed-input, .select {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .select { font-family: var(--font-sans); }
  .seed-input:focus, .select:focus { border-color: var(--accent); }

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
