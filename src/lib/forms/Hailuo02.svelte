<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import {
    HAILUO_TIERS,
    HAILUO_DEFAULT_TIER,
    getHailuoTier,
    type HailuoTier,
    type HailuoResolution
  } from '$lib/hailuo-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type AspectRatio = '16:9' | '9:16' | '1:1';
  type CreationMode = 'with-images' | 'text-only';

  function emptyImage(): ImgState {
    return { file: null, preview: null, url: null };
  }

  function readTierFromUrl(): HailuoTier {
    const t = page.url.searchParams.get('tier');
    return HAILUO_TIERS.some((x) => x.value === t) ? (t as HailuoTier) : HAILUO_DEFAULT_TIER;
  }

  let tier = $state<HailuoTier>(readTierFromUrl());
  let creationMode = $state<CreationMode | null>(null);

  let startImage = $state<ImgState>(emptyImage());
  let endImage = $state<ImgState>(emptyImage());
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');

  const tierMeta = $derived(getHailuoTier(tier));

  const initialTier = getHailuoTier(readTierFromUrl());
  let resolution = $state<HailuoResolution>(initialTier.defaultResolution);
  let duration = $state<number>(initialTier.defaultDuration);
  let promptOptimizer = $state(true);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      replaceState(url, page.state);
    }
  });

  $effect(() => {
    void tier;
    if (!tierMeta.resolutions.includes(resolution)) {
      resolution = tierMeta.defaultResolution;
    }
    if (!tierMeta.durations.includes(duration)) {
      duration = tierMeta.defaultDuration;
    }
  });

  const hasStartImage = $derived(!!startImage.file);
  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(`/api/hailuo-02/${tier}/${task}`);

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo imágenes...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const ALL_ENDPOINTS = HAILUO_TIERS.flatMap((t) => [t.endpoints.i2v, t.endpoints.t2v]);
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });

  const currentEndpointModel = $derived(
    creationMode === 'with-images' ? tierMeta.endpoints.i2v : tierMeta.endpoints.t2v
  );
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 }
  ];

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
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

    if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }

    if (creationMode === 'with-images' && !startImage.file) {
      errorMessage = 'Subí una imagen inicial para usar "Imágenes y texto".';
      phase = 'error';
      return;
    }

    reset();

    try {
      if (creationMode === 'with-images') {
        phase = 'uploading';
        if (!startImage.url && startImage.file) {
          startImage.url = await uploadFile(startImage.file);
        }
        if (endImage.file && !endImage.url) {
          endImage.url = await uploadFile(endImage.file);
        }
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        duration,
        resolution,
        prompt_optimizer: promptOptimizer
      };

      if (creationMode === 'with-images') {
        payload.image_url = startImage.url;
        if (endImage.url) payload.end_image_url = endImage.url;
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
    };
  });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Hailuo-02
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
      options={HAILUO_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Calidad:"
      disabled={isRunning}
    />
  </div>

  <div class="creation-mode-row">
    <span class="creation-mode-label">¿Cómo armarás la toma?</span>
    <div class="creation-mode-options">
      <button
        type="button"
        class="creation-mode-btn"
        class:active={creationMode === 'with-images'}
        onclick={() => (creationMode = 'with-images')}
        disabled={isRunning}
      >
        <span class="creation-mode-icon">🖼️</span>
        <span class="creation-mode-text">Imágenes y texto</span>
      </button>
      <button
        type="button"
        class="creation-mode-btn"
        class:active={creationMode === 'text-only'}
        onclick={() => (creationMode = 'text-only')}
        disabled={isRunning}
      >
        <span class="creation-mode-icon">✍️</span>
        <span class="creation-mode-text">Solo texto</span>
      </button>
    </div>
  </div>

  {#if creationMode}
    <div class="form-body" transition:slide={{ duration: 280 }}>
      {#if creationMode === 'with-images'}
        <div class="image-row" transition:slide={{ duration: 200 }}>
          <div class="slot-wrap">
            <ImageSlot
              bind:state={startImage}
              disabled={isRunning}
              placeholder="Imagen inicial"
            />
          </div>
          {#if hasStartImage && tierMeta.supportsEndImage}
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
      {:else}
        <div transition:slide={{ duration: 200 }}>
          <AspectRatioPicker
            bind:value={aspectRatio}
            options={aspectOptions}
            disabled={isRunning}
          />
          <p class="hint-note">El aspect ratio es referencial — Hailuo-02 entrega salida nativa según la resolución elegida.</p>
        </div>
      {/if}

      <Prompt
        bind:value={prompt}
        placeholder={creationMode === 'with-images'
          ? 'Describe el movimiento / acción...'
          : 'Describe el video que quieres generar...'}
        rows={6}
        disabled={isRunning}
      />

      <div class="row-controls">
        <Dropdown
          bind:value={resolution}
          options={tierMeta.resolutions.map((r) => ({ value: r, label: r }))}
          label="Resolución:"
          disabled={isRunning}
        />

        {#if tierMeta.durations.length > 1}
          <Slider
            bind:value={duration}
            min={tierMeta.durations[0]}
            max={tierMeta.durations[tierMeta.durations.length - 1]}
            step={4}
            label="Duración"
            suffix="s"
            disabled={isRunning}
          />
        {:else}
          <span class="duration-fixed">Duración: <strong>{duration}s</strong></span>
        {/if}
      </div>

      <Switch
        bind:checked={promptOptimizer}
        label="✨ Optimizar prompt automáticamente"
        disabled={isRunning}
      />

      <div transition:fade={{ duration: 150 }}>
        <CostEstimate {unitPrice} {duration} />
      </div>

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
  {/if}
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
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .creation-mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.85rem 1rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.95rem;
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
    font-size: 1.15rem;
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

  .hint-note {
    margin: 0.5rem 0 0;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .row-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    align-items: center;
  }
  .duration-fixed {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .duration-fixed strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
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
