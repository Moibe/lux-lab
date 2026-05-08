<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type AudioSlot = { file: File | null; preview: string | null; url: string | null };

  function emptyAudio(): AudioSlot {
    return { file: null, preview: null, url: null };
  }

  let image = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let audio = $state<AudioSlot>(emptyAudio());
  let prompt = $state('');

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo archivos...',
    submitting: 'Enviando trabajo...',
    polling: 'Animando personaje...',
    done: '¡Listo!',
    error: 'Error'
  };

  const ENDPOINT_PATH = '/api/omnihuman';
  const ENDPOINT_MODEL = 'fal-ai/bytedance/omnihuman/v1.5';

  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap([ENDPOINT_MODEL]).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[ENDPOINT_MODEL]?.unit_price ?? null);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }

  function setAudio(file: File): AudioSlot {
    if (audio.preview) URL.revokeObjectURL(audio.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function clearAudio(e: Event) {
    e.preventDefault();
    if (audio.preview) URL.revokeObjectURL(audio.preview);
    audio = emptyAudio();
  }

  function reset() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    logs = [];
    videoUrl = null;
    errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!image.file && !image.url) {
      errorMessage = 'Sube la imagen del personaje.';
      phase = 'error';
      return;
    }
    if (!audio.file && !audio.url) {
      errorMessage = 'Sube el audio que guiará la animación.';
      phase = 'error';
      return;
    }
    reset();
    try {
      phase = 'uploading';
      if (!image.url && image.file) image.url = await uploadFile(image.file);
      if (!audio.url && audio.file) audio.url = await uploadFile(audio.file);

      const payload: Record<string, unknown> = {
        image_url: image.url,
        audio_url: audio.url
      };
      if (prompt.trim()) payload.prompt = prompt.trim();

      phase = 'submitting';
      const subRes = await fetch(`${ENDPOINT_PATH}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${ENDPOINT_PATH}/status?id=${encodeURIComponent(request_id)}`);
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) {
          logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        }
        if (data.status === 'COMPLETED') {
          const rr = await fetch(`${ENDPOINT_PATH}/result?id=${encodeURIComponent(request_id)}`);
          if (!rr.ok) throw new Error(`Result falló: ${await rr.text()}`);
          const { result } = await rr.json();
          videoUrl = result?.video?.url ?? null;
          phase = 'done';
          return;
        }
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
    if (audio.preview) URL.revokeObjectURL(audio.preview);
  });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Omnihuman v1.5
</h1>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Anima un personaje a partir de una imagen y un audio. Las emociones y los
    movimientos del personaje siguen el audio (lipsync y cuerpo completo).
  </p>

  <ImageSlot
    bind:state={image}
    disabled={isRunning}
    placeholder="Imagen del personaje"
    placeholderHint="jpg, png, webp, gif, avif"
    minHeight="14rem"
  />

  <label class="audio-slot" class:filled={!!audio.preview}>
    <input
      type="file"
      accept="audio/*"
      disabled={isRunning}
      onchange={(e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) audio = setAudio(f);
      }}
    />
    {#if audio.preview}
      <audio src={audio.preview} controls></audio>
      <button
        type="button"
        class="clear"
        aria-label="Quitar audio"
        onclick={clearAudio}
      >×</button>
    {:else}
      <span class="placeholder">
        <span class="big">+</span>
        <span class="hint">
          Audio
          <br /><small>mp3, wav, ogg, m4a, aac</small>
        </span>
      </span>
    {/if}
  </label>

  <Prompt
    bind:value={prompt}
    placeholder="Guía adicional para la animación (opcional)..."
    rows={3}
    disabled={isRunning}
    small
  />

  <CostEstimate {unitPrice} flat flatLabel="por segundo de video resultante" />

  <button class="submit" type="submit" disabled={isRunning}>
    {isRunning ? phaseLabel[phase] : 'Generar'}
  </button>

  <StatusPanel
    {phase}
    phaseLabel={phaseLabel[phase]}
    {errorMessage}
    {logs}
    resultUrl={videoUrl}
  />
</form>

<style>
  .page-title {
    text-align: center;
    max-width: min(1100px, 92vw);
    line-height: 1.1;
  }
  .form {
    margin-top: 2rem;
    width: min(700px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .intro {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.55;
  }

  .audio-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 5rem;
    background: var(--surface-pill);
    border: 1.5px dashed rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-card);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    overflow: hidden;
    padding: 0.5rem;
    transition: border-style var(--transition-fast);
  }
  .audio-slot:hover {
    border-style: solid;
  }
  .audio-slot.filled {
    border-style: solid;
  }
  .audio-slot input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }
  .audio-slot audio {
    width: 100%;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 1rem;
    text-align: center;
  }
  .placeholder .big {
    font-size: 1.75rem;
    font-weight: 300;
    color: rgba(255, 255, 255, 0.55);
  }
  .placeholder .hint {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1.2;
  }
  .placeholder .hint small {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
  }
  .clear {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
  }
  .clear:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  .submit {
    margin-top: 0.5rem;
    padding: 0.95rem 1.5rem;
    background: var(--accent);
    color: var(--text-primary);
    border: none;
    border-radius: var(--radius-pill);
    font-family: var(--font-sans);
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--accent-shadow);
    transition: filter var(--transition-fast), transform var(--transition-fast);
  }
  .submit:hover:not(:disabled) {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }
  .submit:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
