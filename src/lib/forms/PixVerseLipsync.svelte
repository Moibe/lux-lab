<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import { PIXVERSE_LIPSYNC_VOICES } from '$lib/pixverse-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type FileSlot = { file: File | null; preview: string | null; url: string | null };
  type AudioMode = 'audio-file' | 'tts';

  function emptySlot(): FileSlot { return { file: null, preview: null, url: null }; }

  let video = $state<FileSlot>(emptySlot());
  let audio = $state<FileSlot>(emptySlot());
  let mode = $state<AudioMode>('audio-file');
  let voiceId = $state<string>('Auto');
  let text = $state('');

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo archivos...', submitting: 'Enviando trabajo...',
    polling: 'Generando lipsync...', done: '¡Listo!', error: 'Error'
  };

  const ENDPOINT_PATH = '/api/pixverse/lipsync';
  const ENDPOINT_MODEL = 'fal-ai/pixverse/lipsync';
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap([ENDPOINT_MODEL]).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[ENDPOINT_MODEL]?.unit_price ?? null);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }
  function setVideo(file: File): FileSlot {
    if (video.preview) URL.revokeObjectURL(video.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function setAudio(file: File): FileSlot {
    if (audio.preview) URL.revokeObjectURL(audio.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!video.file) { errorMessage = 'Sube el video.'; phase = 'error'; return; }
    if (mode === 'audio-file' && !audio.file) {
      errorMessage = 'Sube el audio o cambia a TTS.'; phase = 'error'; return;
    }
    if (mode === 'tts' && !text.trim()) {
      errorMessage = 'Escribe el texto a sintetizar.'; phase = 'error'; return;
    }
    reset();
    try {
      phase = 'uploading';
      if (!video.url && video.file) video.url = await uploadFile(video.file);
      if (mode === 'audio-file' && !audio.url && audio.file) audio.url = await uploadFile(audio.file);

      const payload: Record<string, unknown> = { video_url: video.url };
      if (mode === 'audio-file') {
        payload.audio_url = audio.url;
      } else {
        payload.text = text.trim();
        payload.voice_id = voiceId;
      }

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
    if (audio.preview) URL.revokeObjectURL(audio.preview);
  });
</script>

<BackButton href="/pixverse" label="PixVerse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  PixVerse - Lipsync
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Sincroniza los labios de un video con audio o texto (TTS).
  </p>

  <label class="video-slot" class:filled={!!video.preview}>
    <input type="file" accept="video/*" disabled={isRunning} onchange={(e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) video = setVideo(f);
    }} />
    {#if video.preview}
      <video src={video.preview} controls muted></video>
    {:else}
      <span class="placeholder"><span class="big">+</span><span class="hint">Video con cara</span></span>
    {/if}
  </label>

  <div class="row">
    <span class="row-label">Fuente de audio:</span>
    <div class="chip-group">
      <button type="button" class="chip-opt" class:active={mode === 'audio-file'}
        onclick={() => (mode = 'audio-file')} disabled={isRunning}>🎵 Archivo</button>
      <button type="button" class="chip-opt" class:active={mode === 'tts'}
        onclick={() => (mode = 'tts')} disabled={isRunning}>💬 Texto (TTS)</button>
    </div>
  </div>

  {#if mode === 'audio-file'}
    <div transition:slide={{ duration: 200 }}>
      <label class="audio-slot" class:filled={!!audio.preview}>
        <input type="file" accept="audio/*" disabled={isRunning} onchange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) audio = setAudio(f);
        }} />
        {#if audio.preview}
          <audio src={audio.preview} controls></audio>
        {:else}
          <span class="placeholder light"><span class="big">+</span><span class="hint">Archivo de audio</span></span>
        {/if}
      </label>
    </div>
  {:else}
    <div transition:slide={{ duration: 200 }} class="tts-block">
      <Prompt bind:value={text} placeholder="Texto a sintetizar..." rows={4} disabled={isRunning} small />
      <div class="field">
        <label class="field-label" for="voice">Voz</label>
        <select id="voice" bind:value={voiceId} class="select" disabled={isRunning}>
          {#each PIXVERSE_LIPSYNC_VOICES as v}
            <option value={v}>{v}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}

  <CostEstimate {unitPrice} flat flatLabel="por video" />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .intro { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.55; }

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

  .audio-slot {
    position: relative; display: flex; align-items: center; justify-content: center;
    min-height: 5rem; background: var(--surface-pill); border: 1.5px dashed rgba(255,255,255,0.2);
    border-radius: var(--radius-card); cursor: pointer; box-shadow: var(--shadow-card); overflow: hidden;
    transition: border-style var(--transition-fast); padding: 0.5rem;
  }
  .audio-slot:hover { border-style: solid; }
  .audio-slot.filled { border-style: solid; }
  .audio-slot input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; z-index: 2; }
  .audio-slot audio { width: 100%; }

  .placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem; text-align: center; }
  .placeholder .big { font-size: 1.75rem; font-weight: 300; color: rgba(255, 255, 255, 0.55); }
  .placeholder .hint { font-size: 0.85rem; color: rgba(255, 255, 255, 0.55); line-height: 1.2; }
  .placeholder.light .big, .placeholder.light .hint { color: rgba(255, 255, 255, 0.55); }

  .row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .row-label { color: var(--text-secondary); font-size: 0.95rem; }
  .chip-group { display: flex; gap: 0.4rem; padding: 0.3rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill); }
  .chip-opt {
    padding: 0.4rem 0.95rem; background: transparent; border: none; border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.88rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .chip-opt:hover:not(:disabled) { color: var(--text-primary); }
  .chip-opt.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); }
  .chip-opt:disabled { opacity: 0.5; cursor: not-allowed; }

  .tts-block { display: flex; flex-direction: column; gap: 1rem; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .select {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: var(--font-sans);
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .select:focus { border-color: var(--accent); }

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
