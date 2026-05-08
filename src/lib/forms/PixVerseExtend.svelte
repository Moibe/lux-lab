<script lang="ts">
  import { fly } from 'svelte/transition';
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
  import { PIXVERSE_STYLES, type PixVerseStyle } from '$lib/pixverse-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type VideoSlot = { file: File | null; preview: string | null; url: string | null };
  type Resolution = '360p' | '540p' | '720p' | '1080p';

  function emptyVideo(): VideoSlot { return { file: null, preview: null, url: null }; }

  // Extend solo en v6
  let video = $state<VideoSlot>(emptyVideo());
  let prompt = $state('');
  let resolution = $state<Resolution>('720p');
  let duration = $state(5);
  let style = $state<'' | PixVerseStyle>('');
  let negativePrompt = $state('');
  let seed = $state<string>('');
  let generateAudio = $state(false);
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo video...', submitting: 'Enviando trabajo...',
    polling: 'Extendiendo video...', done: '¡Listo!', error: 'Error'
  };

  const ENDPOINT_PATH = '/api/pixverse/v6/extend';
  const ENDPOINT_MODEL = 'fal-ai/pixverse/v6/extend';
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap([ENDPOINT_MODEL]).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[ENDPOINT_MODEL]?.unit_price ?? null);

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
  function setVideo(file: File): VideoSlot {
    if (video.preview) URL.revokeObjectURL(video.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function clearVideo(): VideoSlot {
    if (video.preview) URL.revokeObjectURL(video.preview);
    return emptyVideo();
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!video.file) { errorMessage = 'Sube el video que quieras extender.'; phase = 'error'; return; }
    if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (!video.url && video.file) video.url = await uploadFile(video.file);

      const payload: Record<string, unknown> = {
        video_url: video.url,
        prompt: prompt.trim(),
        resolution,
        duration
      };
      if (style) payload.style = style;
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;
      if (generateAudio) payload.generate_audio_switch = true;

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
    if (video.preview) URL.revokeObjectURL(video.preview);
  });
</script>

<BackButton href="/pixverse" label="PixVerse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  PixVerse - Extend Video
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Continúa un video existente. Solo disponible en <strong>v6</strong>.
  </p>

  <label class="video-slot" class:filled={!!video.preview}>
    <input type="file" accept="video/*" disabled={isRunning} onchange={(e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) video = setVideo(f);
    }} />
    {#if video.preview}
      <video src={video.preview} controls muted></video>
      <button type="button" class="clear" aria-label="Quitar" onclick={(e) => { e.preventDefault(); video = clearVideo(); }}>×</button>
    {:else}
      <span class="placeholder"><span class="big">+</span><span class="hint">Video a extender</span></span>
    {/if}
  </label>

  <Prompt bind:value={prompt} placeholder="Cómo continúa la escena..." rows={5} disabled={isRunning} />

  <ChipGroup bind:value={resolution} options={resOptions} label="Resolución:" disabled={isRunning} />

  <Slider bind:value={duration} min={1} max={15} label="Duración extra" suffix="s" disabled={isRunning} />

  <Switch bind:checked={generateAudio} label="🔊 Generar audio (BGM/SFX/diálogo)" disabled={isRunning} />

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

  <CostEstimate {unitPrice} {duration} audio={generateAudio} />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .intro { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.55; }
  .intro strong { color: var(--text-primary); }

  .video-slot {
    position: relative; display: flex; align-items: center; justify-content: center;
    min-height: 12rem; background: #000; border: 1.5px dashed rgba(255,255,255,0.2); border-radius: var(--radius-card);
    color: #fff; cursor: pointer; box-shadow: var(--shadow-card); overflow: hidden;
    transition: border-style var(--transition-fast);
  }
  .video-slot:hover { border-style: solid; }
  .video-slot.filled { border-style: solid; padding: 0; }
  .video-slot input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 2; }
  .video-slot video { width: 100%; max-height: 18rem; display: block; }
  .placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem; text-align: center; }
  .placeholder .big { font-size: 1.75rem; font-weight: 300; color: rgba(255, 255, 255, 0.55); }
  .placeholder .hint { font-size: 0.85rem; color: rgba(255, 255, 255, 0.55); line-height: 1.2; }
  .clear {
    position: absolute; top: 0.4rem; right: 0.4rem; width: 24px; height: 24px;
    background: rgba(0, 0, 0, 0.7); color: #fff; border: none; border-radius: 50%;
    font-size: 1rem; line-height: 1; cursor: pointer; z-index: 3;
    display: flex; align-items: center; justify-content: center;
  }
  .clear:hover { background: rgba(0, 0, 0, 0.9); }

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
