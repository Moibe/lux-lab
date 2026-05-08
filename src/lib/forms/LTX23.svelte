<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import {
    LTX_TIERS,
    LTX_DEFAULT_TIER,
    LTX_TASKS,
    LTX_DEFAULT_TASK,
    LTX_RESOLUTIONS,
    LTX_DEFAULT_RESOLUTION,
    ltxEndpointId,
    tierSupportsTask,
    type LTXTier,
    type LTXTask,
    type LTXResolution
  } from '$lib/ltx-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type FileSlot = { file: File | null; preview: string | null; url: string | null };
  type AspectRatio = '16:9' | '9:16' | '1:1';

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }
  function emptySlot(): FileSlot { return { file: null, preview: null, url: null }; }

  function readTierFromUrl(): LTXTier {
    const t = page.url.searchParams.get('tier');
    return LTX_TIERS.some((x) => x.value === t) ? (t as LTXTier) : LTX_DEFAULT_TIER;
  }
  function readTaskFromUrl(): LTXTask {
    const t = page.url.searchParams.get('task');
    return LTX_TASKS.some((x) => x.value === t) ? (t as LTXTask) : LTX_DEFAULT_TASK;
  }

  let tier = $state<LTXTier>(readTierFromUrl());
  let task = $state<LTXTask>(readTaskFromUrl());

  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<LTXResolution>(LTX_DEFAULT_RESOLUTION);
  let duration = $state(5);

  let startImage = $state<ImgState>(emptyImage());
  let endImage = $state<ImgState>(emptyImage());

  let videoSlot = $state<FileSlot>(emptySlot());
  let audioSlot = $state<FileSlot>(emptySlot());

  let extendMode = $state<'start' | 'end'>('end');
  let retakeStartTime = $state<string>('');

  let negativePrompt = $state('');
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const url = new URL(page.url);
    let dirty = false;
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      dirty = true;
    }
    if (url.searchParams.get('task') !== task) {
      url.searchParams.set('task', task);
      dirty = true;
    }
    if (dirty) replaceState(url, page.state);
  });

  $effect(() => {
    if (!tierSupportsTask(tier, task)) {
      tier = 'standard';
    }
  });

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo archivos...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const endpointPath = $derived(`/api/ltx-2.3/${tier}/${task}`);
  const endpointModel = $derived(ltxEndpointId(tier, task));

  const ALL_ENDPOINTS = LTX_TASKS.flatMap((t) =>
    t.tiers.map((tr) => ltxEndpointId(tr, t.value))
  );
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[endpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 }
  ];

  const fastDisabled = $derived(!tierSupportsTask('fast', task));

  const tierOptions = $derived(
    LTX_TIERS.filter((t) => t.value !== 'fast' || !fastDisabled).map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.hint
    }))
  );

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }

  function setVideo(file: File): FileSlot {
    if (videoSlot.preview) URL.revokeObjectURL(videoSlot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function clearVideo(): FileSlot {
    if (videoSlot.preview) URL.revokeObjectURL(videoSlot.preview);
    return emptySlot();
  }
  function setAudio(file: File): FileSlot {
    if (audioSlot.preview) URL.revokeObjectURL(audioSlot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function clearAudio(): FileSlot {
    if (audioSlot.preview) URL.revokeObjectURL(audioSlot.preview);
    return emptySlot();
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

  function selectTask(next: LTXTask) {
    task = next;
    if (!tierSupportsTask(tier, next)) {
      tier = 'standard';
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (task !== 'audio2v' && task !== 'extend') {
      if (!prompt.trim()) {
        errorMessage = 'Escribe un prompt.';
        phase = 'error';
        return;
      }
    }

    if (task === 'i2v' && !startImage.file) {
      errorMessage = 'Sube la imagen inicial.';
      phase = 'error';
      return;
    }

    if (task === 'audio2v' && !audioSlot.file) {
      errorMessage = 'Sube el audio.';
      phase = 'error';
      return;
    }

    if ((task === 'extend' || task === 'retake') && !videoSlot.file) {
      errorMessage = 'Sube el video.';
      phase = 'error';
      return;
    }

    reset();

    try {
      phase = 'uploading';

      if (task === 'i2v') {
        if (!startImage.url && startImage.file) {
          startImage.url = await uploadFile(startImage.file);
        }
        if (endImage.file && !endImage.url) {
          endImage.url = await uploadFile(endImage.file);
        }
      }
      if (task === 'audio2v') {
        if (!audioSlot.url && audioSlot.file) {
          audioSlot.url = await uploadFile(audioSlot.file);
        }
        if (videoSlot.file && !videoSlot.url) {
          videoSlot.url = await uploadFile(videoSlot.file);
        }
      }
      if (task === 'extend' || task === 'retake') {
        if (!videoSlot.url && videoSlot.file) {
          videoSlot.url = await uploadFile(videoSlot.file);
        }
      }

      const payload: Record<string, unknown> = {};

      if (prompt.trim()) payload.prompt = prompt.trim();
      payload.resolution = resolution;
      payload.duration = duration;
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

      if (task === 't2v') {
        payload.aspect_ratio = aspectRatio;
      } else if (task === 'i2v') {
        payload.image_url = startImage.url;
        if (endImage.url) payload.end_image_url = endImage.url;
      } else if (task === 'audio2v') {
        payload.audio_url = audioSlot.url;
        if (videoSlot.url) payload.image_url = videoSlot.url;
      } else if (task === 'extend') {
        payload.video_url = videoSlot.url;
        payload.mode = extendMode;
      } else if (task === 'retake') {
        payload.video_url = videoSlot.url;
        const st = parseFloat(retakeStartTime);
        if (!isNaN(st) && st >= 0) payload.start_time = st;
      }

      phase = 'submitting';
      const subRes = await fetch(`${endpointPath}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${endpointPath}/status?id=${encodeURIComponent(request_id)}`);
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) {
          logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        }
        if (data.status === 'COMPLETED') {
          videoUrl = data.result?.video?.url ?? null;
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

  $effect(() => {
    return () => {
      if (pollTimer) clearTimeout(pollTimer);
      if (startImage.preview) URL.revokeObjectURL(startImage.preview);
      if (endImage.preview) URL.revokeObjectURL(endImage.preview);
      if (videoSlot.preview) URL.revokeObjectURL(videoSlot.preview);
      if (audioSlot.preview) URL.revokeObjectURL(audioSlot.preview);
    };
  });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  LTX-2.3
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
      options={tierOptions}
      label="Calidad:"
      disabled={isRunning}
    />
  </div>

  <div class="creation-mode-row">
    <span class="creation-mode-label">¿Cómo armarás la toma?</span>
    <div class="creation-mode-options">
      {#each LTX_TASKS as t}
        <button
          type="button"
          class="creation-mode-btn"
          class:active={task === t.value}
          onclick={() => selectTask(t.value)}
          disabled={isRunning}
        >
          <span class="creation-mode-icon">{t.icon}</span>
          <span class="creation-mode-text">{t.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="form-body" transition:slide={{ duration: 280 }}>
    {#if task === 'i2v'}
      <div class="image-row" transition:slide={{ duration: 200 }}>
        <div class="slot-wrap">
          <ImageSlot
            bind:state={startImage}
            disabled={isRunning}
            placeholder="Imagen inicial"
          />
        </div>
        {#if startImage.file}
          <span class="arrow" aria-hidden="true" transition:fade={{ duration: 150 }}>→</span>
          <div class="slot-wrap" transition:slide={{ duration: 200, axis: 'x' }}>
            <ImageSlot
              bind:state={endImage}
              disabled={isRunning}
              placeholder="Imagen final"
              placeholderHint="(opcional)"
              optional
            />
          </div>
        {/if}
      </div>
    {/if}

    {#if task === 't2v'}
      <div transition:slide={{ duration: 200 }}>
        <AspectRatioPicker
          bind:value={aspectRatio}
          options={aspectOptions}
          disabled={isRunning}
        />
      </div>
    {/if}

    {#if task === 'audio2v'}
      <div transition:slide={{ duration: 200 }} class="upload-stack">
        <label class="audio-slot" class:filled={!!audioSlot.preview}>
          <input
            type="file"
            accept="audio/*"
            disabled={isRunning}
            onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) audioSlot = setAudio(f);
            }}
          />
          {#if audioSlot.preview}
            <audio src={audioSlot.preview} controls></audio>
            <button
              type="button"
              class="clear"
              aria-label="Quitar audio"
              onclick={(e) => {
                e.preventDefault();
                audioSlot = clearAudio();
              }}
            >×</button>
          {:else}
            <span class="placeholder">
              <span class="big">🎵</span>
              <span class="hint">Audio (mp3, wav, m4a, ogg, aac)</span>
            </span>
          {/if}
        </label>

        <label class="video-slot" class:filled={!!videoSlot.preview}>
          <input
            type="file"
            accept="video/*,image/*"
            disabled={isRunning}
            onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) videoSlot = setVideo(f);
            }}
          />
          {#if videoSlot.preview}
            {#if videoSlot.file?.type.startsWith('image/')}
              <img src={videoSlot.preview} alt="Imagen guía" />
            {:else}
              <video src={videoSlot.preview} controls muted></video>
            {/if}
            <button
              type="button"
              class="clear"
              aria-label="Quitar"
              onclick={(e) => {
                e.preventDefault();
                videoSlot = clearVideo();
              }}
            >×</button>
          {:else}
            <span class="placeholder">
              <span class="big">+</span>
              <span class="hint">Imagen guía (opcional)</span>
            </span>
          {/if}
        </label>
      </div>
    {/if}

    {#if task === 'extend' || task === 'retake'}
      <div transition:slide={{ duration: 200 }}>
        <label class="video-slot" class:filled={!!videoSlot.preview}>
          <input
            type="file"
            accept="video/*"
            disabled={isRunning}
            onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) videoSlot = setVideo(f);
            }}
          />
          {#if videoSlot.preview}
            <video src={videoSlot.preview} controls muted></video>
            <button
              type="button"
              class="clear"
              aria-label="Quitar"
              onclick={(e) => {
                e.preventDefault();
                videoSlot = clearVideo();
              }}
            >×</button>
          {:else}
            <span class="placeholder">
              <span class="big">+</span>
              <span class="hint">
                {task === 'extend' ? 'Video a extender' : 'Video a regenerar'}
              </span>
            </span>
          {/if}
        </label>
      </div>
    {/if}

    {#if task === 'extend'}
      <div class="row" transition:slide={{ duration: 200 }}>
        <span class="row-label">Extender desde:</span>
        <div class="chip-group">
          <button
            type="button"
            class="chip-opt"
            class:active={extendMode === 'end'}
            onclick={() => (extendMode = 'end')}
            disabled={isRunning}
          >Final</button>
          <button
            type="button"
            class="chip-opt"
            class:active={extendMode === 'start'}
            onclick={() => (extendMode = 'start')}
            disabled={isRunning}
          >Inicio</button>
        </div>
      </div>
    {/if}

    {#if task === 'retake'}
      <div class="field" transition:slide={{ duration: 200 }}>
        <label class="field-label" for="retake-start">Tiempo de inicio (s, opcional)</label>
        <input
          id="retake-start"
          type="number"
          min="0"
          step="0.1"
          bind:value={retakeStartTime}
          class="text-input"
          placeholder="0"
          disabled={isRunning}
        />
      </div>
    {/if}

    <div transition:slide={{ duration: 200 }}>
      <Prompt
        bind:value={prompt}
        placeholder={
          task === 'audio2v'
            ? 'Descripción de la escena (opcional)...'
            : task === 'extend'
              ? 'Cómo continúa la escena (opcional)...'
              : task === 'retake'
                ? 'Cómo se debe regenerar...'
                : task === 'i2v'
                  ? 'Describe el movimiento / acción...'
                  : 'Describe el video que quieres generar...'
        }
        rows={5}
        disabled={isRunning}
      />
    </div>

    <div class="grid-row">
      <Dropdown
        bind:value={resolution}
        options={LTX_RESOLUTIONS.map((r) => ({ value: r.value, label: r.label }))}
        label="Resolución:"
        disabled={isRunning}
      />
    </div>

    {#if task !== 'retake'}
      <Slider
        bind:value={duration}
        min={1}
        max={20}
        label="Duración"
        suffix="s"
        disabled={isRunning}
      />
    {/if}

    <Collapsible bind:open={advancedOpen} title="Avanzado">
      <div class="field">
        <label class="field-label" for="neg-prompt">Prompt negativo (qué evitar)</label>
        <Prompt
          bind:value={negativePrompt}
          placeholder="blur, distort, and low quality"
          rows={2}
          small
          disabled={isRunning}
        />
      </div>
      <div class="field">
        <label class="field-label" for="seed">Seed (opcional)</label>
        <input
          id="seed"
          type="number"
          min="0"
          bind:value={seed}
          class="text-input"
          placeholder="(aleatorio)"
          disabled={isRunning}
        />
      </div>
    </Collapsible>

    <CostEstimate {unitPrice} {duration} audio={false} />

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
  </div>
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

  .tier-row {
    display: flex;
    justify-content: flex-start;
  }

  .creation-mode-row {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .creation-mode-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .creation-mode-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.6rem;
  }
  .creation-mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 0.85rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast),
      color var(--transition-fast), transform var(--transition-fast);
  }
  .creation-mode-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
    transform: translateY(-1px);
  }
  .creation-mode-btn.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
    border-color: transparent;
  }
  .creation-mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .creation-mode-icon {
    font-size: 1.05rem;
    line-height: 1;
  }
  .creation-mode-text {
    white-space: nowrap;
  }

  .form-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .image-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: stretch;
  }
  .slot-wrap {
    flex: 1;
    min-width: 12rem;
    display: flex;
  }
  .slot-wrap > :global(.image-slot) {
    flex: 1;
  }
  .arrow {
    color: var(--text-muted);
    font-size: 1.5rem;
    align-self: center;
  }

  .upload-stack {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .video-slot,
  .audio-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    border: 1.5px dashed rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-card);
    color: #fff;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    overflow: hidden;
    transition: border-style var(--transition-fast);
  }
  .video-slot { min-height: 12rem; }
  .audio-slot {
    min-height: 5rem;
    background: var(--surface-pill);
    padding: 0.5rem;
  }
  .video-slot:hover,
  .audio-slot:hover { border-style: solid; }
  .video-slot.filled,
  .audio-slot.filled { border-style: solid; }
  .video-slot.filled { padding: 0; }
  .video-slot input[type='file'],
  .audio-slot input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }
  .video-slot video,
  .video-slot img {
    width: 100%;
    max-height: 18rem;
    display: block;
    object-fit: contain;
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
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .clear:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .row-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .chip-group {
    display: flex;
    gap: 0.4rem;
    padding: 0.3rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
  }
  .chip-opt {
    padding: 0.4rem 0.95rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .chip-opt:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .chip-opt.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
  }
  .chip-opt:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .grid-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .field-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  .text-input {
    background: rgba(255, 255, 255, 0.04);
    border: var(--border-subtle);
    border-radius: 8px;
    padding: 0.5rem 0.85rem;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .text-input:focus {
    border-color: var(--accent);
  }
  .text-input::placeholder {
    color: var(--text-muted);
    font-family: var(--font-sans);
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
