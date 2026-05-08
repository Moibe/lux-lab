<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type VideoSlot = { file: File | null; preview: string | null; url: string | null };
  type SwapMode = 'person' | 'object' | 'background';
  type SwapResolution = '360p' | '540p' | '720p';

  function emptyVideo(): VideoSlot { return { file: null, preview: null, url: null }; }

  let video = $state<VideoSlot>(emptyVideo());
  let image = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let mode = $state<SwapMode>('person');
  let keyframeId = $state<string>('1');
  let resolution = $state<SwapResolution>('720p');
  let originalSound = $state(true);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo archivos...', submitting: 'Enviando trabajo...',
    polling: 'Procesando swap...', done: '¡Listo!', error: 'Error'
  };

  const ENDPOINT_PATH = '/api/pixverse/swap';
  const ENDPOINT_MODEL = 'fal-ai/pixverse/swap';
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap([ENDPOINT_MODEL]).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[ENDPOINT_MODEL]?.unit_price ?? null);

  const resOptions: { value: SwapResolution; label: string }[] = [
    { value: '360p', label: '360p' },
    { value: '540p', label: '540p' },
    { value: '720p', label: '720p' }
  ];
  const modeOptions: { value: SwapMode; label: string }[] = [
    { value: 'person', label: '👤 Persona' },
    { value: 'object', label: '📦 Objeto' },
    { value: 'background', label: '🌄 Fondo' }
  ];

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }
  function setVideo(file: File): VideoSlot {
    if (video.preview) URL.revokeObjectURL(video.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!video.file) { errorMessage = 'Sube el video.'; phase = 'error'; return; }
    if (!image.file) { errorMessage = 'Sube la imagen target.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (!video.url && video.file) video.url = await uploadFile(video.file);
      if (!image.url && image.file) image.url = await uploadFile(image.file);

      const payload: Record<string, unknown> = {
        video_url: video.url,
        image_url: image.url,
        mode,
        resolution,
        original_sound_switch: originalSound
      };
      const kf = parseInt(keyframeId, 10);
      if (!isNaN(kf) && kf >= 1) payload.keyframe_id = kf;
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

      phase = 'submitting';
      const subRes = await fetch(`${ENDPOINT_PATH}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${ENDPOINT_PATH}/status?id=${encodeURIComponent(request_id)}`);
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
    if (image.preview) URL.revokeObjectURL(image.preview);
    if (video.preview) URL.revokeObjectURL(video.preview);
  });
</script>

<BackButton href="/pixverse" label="PixVerse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  PixVerse - Swap
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Reemplaza una <strong>persona, objeto o fondo</strong> en un video usando una imagen target.
  </p>

  <ChipGroup bind:value={mode} options={modeOptions} label="Qué cambiar:" disabled={isRunning} />

  <div class="pair">
    <div class="pair-col">
      <span class="sub-label">Video fuente</span>
      <label class="video-slot" class:filled={!!video.preview}>
        <input type="file" accept="video/*" disabled={isRunning} onchange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) video = setVideo(f);
        }} />
        {#if video.preview}
          <video src={video.preview} controls muted></video>
        {:else}
          <span class="placeholder"><span class="big">+</span><span class="hint">Video</span></span>
        {/if}
      </label>
    </div>
    <div class="pair-col">
      <span class="sub-label">Imagen target ({mode})</span>
      <ImageSlot bind:state={image} disabled={isRunning} placeholder="Target" minHeight="11rem" />
    </div>
  </div>

  <ChipGroup bind:value={resolution} options={resOptions} label="Resolución:" disabled={isRunning} />

  <Switch bind:checked={originalSound} label="🔊 Conservar audio original" disabled={isRunning} />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <label class="field-label" for="keyframe">Keyframe ID (frame de referencia, 1 a duración × 24)</label>
      <input id="keyframe" type="number" min="1" bind:value={keyframeId} class="seed-input" disabled={isRunning} />
    </div>
    <div class="field">
      <label class="field-label" for="seed">Seed (opcional)</label>
      <input id="seed" type="number" min="0" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
    </div>
  </Collapsible>

  <CostEstimate {unitPrice} flat flatLabel="por video" />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .intro { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.55; }
  .intro strong { color: var(--text-primary); }

  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .pair-col { display: flex; flex-direction: column; gap: 0.45rem; }
  .sub-label { color: var(--text-muted); font-size: 0.85rem; }

  .video-slot {
    position: relative; display: flex; align-items: center; justify-content: center;
    min-height: 11rem; background: #000; border: 1.5px dashed rgba(255,255,255,0.2); border-radius: var(--radius-card);
    color: #fff; cursor: pointer; box-shadow: var(--shadow-card); overflow: hidden;
    transition: border-style var(--transition-fast);
  }
  .video-slot:hover { border-style: solid; }
  .video-slot.filled { border-style: solid; padding: 0; }
  .video-slot input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 2; }
  .video-slot video { width: 100%; max-height: 14rem; display: block; }

  .placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem; text-align: center; }
  .placeholder .big { font-size: 1.75rem; font-weight: 300; color: rgba(255, 255, 255, 0.55); }
  .placeholder .hint { font-size: 0.85rem; color: rgba(255, 255, 255, 0.55); line-height: 1.2; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .seed-input {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .seed-input:focus { border-color: var(--accent); }

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
