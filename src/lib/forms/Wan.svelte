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
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import {
    WAN_MODELS,
    WAN_DEFAULT_SLUG,
    getWanModel,
    allWanEndpointIds
  } from '$lib/wan-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  type CreationMode = 'with-images' | 'text-only';

  function emptyImage(): ImageSlotState {
    return { file: null, preview: null, url: null };
  }

  function readModelFromUrl(): string {
    const m = page.url.searchParams.get('model');
    return WAN_MODELS.some((x) => x.slug === m) ? (m as string) : WAN_DEFAULT_SLUG;
  }

  let modelSlug = $state<string>(readModelFromUrl());
  const model = $derived(getWanModel(modelSlug));

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('model') !== modelSlug) {
      url.searchParams.set('model', modelSlug);
      replaceState(url, page.state);
    }
  });

  let creationMode = $state<CreationMode | null>(null);

  // Si el modelo elegido no soporta i2v y estábamos en with-images, cambia a text-only.
  $effect(() => {
    if (creationMode === 'with-images' && !model.i2vModelId) {
      creationMode = 'text-only';
    }
  });

  let image = $state<ImageSlotState>(emptyImage());
  let endImage = $state<ImageSlotState>(emptyImage());
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<string>('1080p');
  let duration = $state<number>(5);
  let seed = $state<string>('');
  let negativePrompt = $state('');
  let safetyChecker = $state(true);
  let promptExpansion = $state(true);
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  // Cuando cambia el modelo, reajustar resolution/aspectRatio/duration a defaults válidos.
  $effect(() => {
    const m = model;
    if (m.resolutions.length > 0 && !m.resolutions.includes(resolution)) {
      // preferir 1080p, luego 720p, luego último disponible
      resolution = m.resolutions.includes('1080p')
        ? '1080p'
        : m.resolutions.includes('720p')
          ? '720p'
          : m.resolutions[m.resolutions.length - 1];
    }
    if (m.supportsAspectRatio && !m.aspectRatios.includes(aspectRatio)) {
      aspectRatio = '16:9';
    }
    if (m.durations.length > 0 && !m.durations.includes(duration)) {
      duration = m.defaultDuration;
    }
  });

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo imagen...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(`/api/wan/${modelSlug}/${task === 'i2v' ? 'image-to-video' : 'text-to-video'}`);
  const currentEndpointModel = $derived(
    task === 'i2v' ? model.i2vModelId : model.t2vModelId
  );

  const ALL_ENDPOINTS = allWanEndpointIds();
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const priceEntry = $derived(
    currentEndpointModel ? priceMap[currentEndpointModel] : undefined
  );
  const unitPrice = $derived(priceEntry?.unit_price ?? null);
  const priceUnit = $derived(priceEntry?.unit ?? '');
  const isPerSecond = $derived(priceUnit.toLowerCase().includes('second'));
  // Para CostEstimate: si es per-second, usamos duration normal; si es per-video u otro,
  // pasamos duration=1 para que unitPrice*1 = unitPrice (preservando comportamiento previo).
  const costDuration = $derived(isPerSecond ? duration : 1);

  const aspectOptions = $derived(
    model.aspectRatios.map((v) => {
      const meta: Record<AspectRatio, { w: number; h: number }> = {
        '16:9': { w: 36, h: 20 },
        '9:16': { w: 20, h: 36 },
        '1:1': { w: 28, h: 28 },
        '4:3': { w: 32, h: 24 },
        '3:4': { w: 24, h: 32 }
      };
      return { value: v, label: v, w: meta[v].w, h: meta[v].h };
    })
  );

  const resolutionOptions = $derived(
    model.resolutions.map((r) => ({ value: r, label: r }))
  );
  const durationOptions = $derived(
    model.durations.map((d) => ({ value: String(d), label: `${d}s` }))
  );

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
    if (creationMode === 'with-images' && !image.file) {
      errorMessage = 'Sube una imagen para "Imágenes y texto".';
      phase = 'error';
      return;
    }

    reset();
    try {
      if (creationMode === 'with-images') {
        phase = 'uploading';
        if (!image.url && image.file) image.url = await uploadFile(image.file);
        if (endImage.file && !endImage.url) endImage.url = await uploadFile(endImage.file);
      }

      const payload: Record<string, unknown> = { prompt: prompt.trim() };
      if (model.supportsAspectRatio && creationMode === 'text-only') {
        payload.aspect_ratio = aspectRatio;
      }
      if (model.resolutions.length > 0) payload.resolution = resolution;
      if (model.durations.length > 0 || model.slug !== 'pro') {
        // pro tiene duración fija (6s); no la mandamos
        if (model.slug !== 'pro') payload.duration = duration;
      }
      if (model.supportsNegativePrompt && negativePrompt.trim()) {
        payload.negative_prompt = negativePrompt.trim();
      }
      if (model.supportsSafetyChecker) payload.enable_safety_checker = safetyChecker;
      if (model.supportsPromptExpansion) payload.enable_prompt_expansion = promptExpansion;

      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

      if (creationMode === 'with-images') {
        payload.image_url = image.url;
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
        const r = await fetch(
          `${endpointPath}/status?id=${encodeURIComponent(request_id)}`
        );
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

  $effect(() => () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (image.preview) URL.revokeObjectURL(image.preview);
    if (endImage.preview) URL.revokeObjectURL(endImage.preview);
  });

  const dropdownOptions = $derived(
    WAN_MODELS.map((m) => ({ value: m.slug, label: m.label, hint: m.hint }))
  );
  const hasI2V = $derived(!!model.i2vModelId);

  // Wrapper para ChipGroup con duration (string<->number)
  let durationStr = $state('5');
  $effect(() => { durationStr = String(duration); });
  $effect(() => { const n = parseInt(durationStr, 10); if (!isNaN(n)) duration = n; });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Wan - Image / Text to Video
</h1>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="model-row">
    <Dropdown
      bind:value={modelSlug}
      options={dropdownOptions}
      label="Modelo:"
      disabled={isRunning}
    />
  </div>

  {#if model.note}
    <p class="model-note" transition:fade={{ duration: 150 }}>{model.note}</p>
  {/if}

  {#if model.resolutions.length > 0}
    <ChipGroup
      bind:value={resolution}
      options={resolutionOptions}
      label="Resolución:"
      disabled={isRunning}
    />
  {/if}

  <div class="creation-mode-row">
    <span class="creation-mode-label">¿Cómo armarás la toma?</span>
    <div class="creation-mode-options">
      <button
        type="button"
        class="creation-mode-btn"
        class:active={creationMode === 'with-images'}
        onclick={() => (creationMode = 'with-images')}
        disabled={isRunning || !hasI2V}
        title={!hasI2V ? 'Este modelo no soporta image-to-video' : ''}
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
    {#if !hasI2V}
      <small class="hint-line">Este modelo solo soporta text-to-video.</small>
    {/if}
  </div>

  {#if creationMode}
    <div class="form-body" transition:slide={{ duration: 280 }}>
      {#if creationMode === 'with-images'}
        <div class="image-row" transition:slide={{ duration: 200 }}>
          <div class="slot-wrap">
            <ImageSlot
              bind:state={image}
              disabled={isRunning}
              placeholder="Imagen base"
              placeholderHint="(JPEG/PNG/WEBP, max 20MB)"
              minHeight="11rem"
            />
          </div>

          {#if image.file && model.slug.startsWith('v2-7')}
            <span class="arrow" aria-hidden="true" transition:fade={{ duration: 150 }}>→</span>
            <div class="slot-wrap" transition:slide={{ duration: 200, axis: 'x' }}>
              <ImageSlot
                bind:state={endImage}
                disabled={isRunning}
                placeholder="Frame final"
                placeholderHint="(opcional)"
                optional
                minHeight="11rem"
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if creationMode === 'text-only' && model.supportsAspectRatio}
        <div transition:slide={{ duration: 200 }}>
          <AspectRatioPicker
            bind:value={aspectRatio}
            options={aspectOptions}
            disabled={isRunning}
          />
        </div>
      {/if}

      <Prompt
        bind:value={prompt}
        placeholder={creationMode === 'with-images'
          ? 'Describe el movimiento / acción del video...'
          : 'Describe el video que quieres generar...'}
        rows={creationMode === 'with-images' ? 5 : 6}
        maxlength={5000}
        disabled={isRunning}
      />

      {#if model.slug !== 'pro'}
        {#if model.durations.length > 0}
          <ChipGroup
            bind:value={durationStr}
            options={durationOptions}
            label="Duración:"
            disabled={isRunning}
          />
        {:else}
          <Slider
            bind:value={duration}
            min={2}
            max={15}
            label="Duración"
            suffix="s"
            disabled={isRunning}
          />
        {/if}
      {/if}

      <Collapsible bind:open={advancedOpen} title="Avanzado">
        {#if model.supportsNegativePrompt}
          <div class="field">
            <label class="field-label" for="neg-prompt">Prompt negativo (qué evitar)</label>
            <Prompt
              bind:value={negativePrompt}
              placeholder="blur, distort, low quality..."
              rows={2}
              maxlength={500}
              small
              disabled={isRunning}
            />
          </div>
        {/if}
        <div class="field">
          <label class="field-label" for="seed">Seed (opcional, para reproducir output)</label>
          <input
            id="seed"
            type="number"
            min="0"
            max="2147483647"
            bind:value={seed}
            class="seed-input"
            placeholder="(aleatorio)"
            disabled={isRunning}
          />
        </div>
        {#if model.supportsPromptExpansion}
          <Switch
            bind:checked={promptExpansion}
            label="✨ Expansión de prompt (LLM rewrite)"
            disabled={isRunning}
          />
        {/if}
        {#if model.supportsSafetyChecker}
          <Switch
            bind:checked={safetyChecker}
            label="🛡️ Safety checker (filtro de contenido)"
            disabled={isRunning}
          />
        {/if}
      </Collapsible>

      <CostEstimate {unitPrice} duration={costDuration} />

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
  .model-row {
    display: flex;
    justify-content: flex-start;
  }
  .model-note {
    margin: -0.5rem 0 0;
    padding: 0.55rem 0.85rem;
    background: rgba(37, 99, 235, 0.08);
    border: 1px solid rgba(37, 99, 235, 0.25);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-size: 0.85rem;
    line-height: 1.4;
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
  .hint-line {
    color: var(--text-muted);
    font-size: 0.8rem;
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
  .image-row > .slot-wrap {
    flex: 1;
    min-width: 12rem;
    display: flex;
  }
  .image-row > .slot-wrap > :global(.image-slot) {
    flex: 1;
  }
  .arrow {
    color: var(--text-muted);
    font-size: 1.5rem;
    align-self: center;
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
  .seed-input {
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
  .seed-input:focus {
    border-color: var(--accent);
  }
  .seed-input::placeholder {
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
