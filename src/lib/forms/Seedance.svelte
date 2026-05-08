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
    SEEDANCE_TIERS,
    SEEDANCE_DEFAULT_TIER,
    type SeedanceTier
  } from '$lib/seedance-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type AspectRatio = 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  type Resolution = '480p' | '720p' | '1080p';
  type CreationMode = 'with-images' | 'text-only';

  function emptyImage(): ImageSlotState {
    return { file: null, preview: null, url: null };
  }

  function readTierFromUrl(): SeedanceTier {
    const t = page.url.searchParams.get('tier');
    return SEEDANCE_TIERS.some((x) => x.value === t)
      ? (t as SeedanceTier)
      : SEEDANCE_DEFAULT_TIER;
  }

  let tier = $state<SeedanceTier>(readTierFromUrl());

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      replaceState(url, page.state);
    }
  });

  const tierMeta = $derived(SEEDANCE_TIERS.find((t) => t.value === tier)!);

  let creationMode = $state<CreationMode | null>(null);
  let startImage = $state<ImageSlotState>(emptyImage());
  let endImage = $state<ImageSlotState>(emptyImage());
  let prompt = $state('');
  let duration = $state<number>(5); // numeric for v1 (2-12) o v2 (4-15)
  let durationAuto = $state(true); // sólo aplica a v2
  let resolution = $state<Resolution>('720p');
  let aspectRatio = $state<AspectRatio>('auto');
  let generateAudio = $state(true);
  let cameraFixed = $state(false);
  let safetyChecker = $state(true);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

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
    uploading: 'Subiendo imagen...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(`/api/seedance/${task === 'i2v' ? 'image-to-video' : 'text-to-video'}`);

  // Si la tier seleccionada deja de soportar la resolution actual, ajustar.
  $effect(() => {
    if (!tierMeta.resolutions.includes(resolution)) {
      resolution = tierMeta.resolutions[tierMeta.resolutions.length - 1];
    }
  });

  // Duration ranges por familia
  const durationMin = $derived(tierMeta.family === 'v2' ? 4 : 2);
  const durationMax = $derived(tierMeta.family === 'v2' ? 15 : 12);
  $effect(() => {
    if (duration < durationMin) duration = durationMin;
    if (duration > durationMax) duration = durationMax;
  });

  // Pricing — recolectar todos los endpoints (i2v+t2v de todas las tiers)
  const ALL_ENDPOINTS = SEEDANCE_TIERS.flatMap((t) =>
    [t.endpoints.i2v, t.endpoints.t2v].filter((e): e is string => e !== null)
  );
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const currentEndpointModel = $derived(
    task === 'i2v' ? tierMeta.endpoints.i2v : tierMeta.endpoints.t2v
  );
  const unitPrice = $derived(
    currentEndpointModel ? priceMap[currentEndpointModel]?.unit_price ?? null : null
  );
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

  const hasStartImage = $derived(!!startImage.file);

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (creationMode === 'with-images') {
      if (!startImage.file) {
        errorMessage = 'Sube una imagen inicial.';
        phase = 'error';
        return;
      }
    } else {
      if (!prompt.trim()) {
        errorMessage = 'Escribe un prompt.';
        phase = 'error';
        return;
      }
    }

    reset();
    try {
      if (creationMode === 'with-images') {
        phase = 'uploading';
        if (startImage.file && !startImage.url) startImage.url = await uploadFile(startImage.file);
        if (endImage.file && !endImage.url) endImage.url = await uploadFile(endImage.file);
      }

      const payload: Record<string, unknown> = {
        tier,
        family: tierMeta.family,
        resolution,
        aspect_ratio: aspectRatio
      };
      if (creationMode === 'with-images') {
        payload.image_url = startImage.url;
        if (endImage.url) payload.end_image_url = endImage.url;
        if (prompt.trim()) payload.prompt = prompt.trim();
      } else {
        payload.prompt = prompt.trim();
      }

      // Duration: v2 puede ir auto, v1 siempre numérico.
      if (tierMeta.family === 'v2' && durationAuto) {
        payload.duration = 'auto';
      } else {
        payload.duration = duration;
      }

      if (tierMeta.family === 'v2') {
        payload.generate_audio = generateAudio;
      } else {
        payload.camera_fixed = cameraFixed;
        payload.enable_safety_checker = safetyChecker;
      }

      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum)) payload.seed = seedNum;

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
          `${endpointPath}/status?id=${encodeURIComponent(request_id)}&tier=${encodeURIComponent(tier)}&task=${task}`
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
    if (startImage.preview) URL.revokeObjectURL(startImage.preview);
    if (endImage.preview) URL.revokeObjectURL(endImage.preview);
  });
</script>

<BackButton href="/seedance" label="Seedance" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Seedance - Image / Text to Video
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
      options={SEEDANCE_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Versión:"
      disabled={isRunning}
    />
  </div>

  <ChipGroup
    bind:value={resolution}
    options={resolutionOptions}
    label="Resolución:"
    disabled={isRunning}
  />

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

          {#if hasStartImage}
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

      <AspectRatioPicker
        bind:value={aspectRatio}
        options={aspectOptions}
        disabled={isRunning}
      />

      <Prompt
        bind:value={prompt}
        placeholder={creationMode === 'with-images'
          ? 'Prompt opcional (qué movimiento/acción)...'
          : 'Describe el video que quieres generar...'}
        rows={creationMode === 'with-images' ? 5 : 6}
        disabled={isRunning}
      />

      {#if tierMeta.family === 'v2'}
        <Switch
          bind:checked={durationAuto}
          label="🤖 Duración automática (deja que el modelo decida)"
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
          <label class="field-label" for="seed">Seed (opcional, -1 = aleatorio)</label>
          <input
            id="seed"
            type="number"
            bind:value={seed}
            class="seed-input"
            placeholder="(aleatorio)"
            disabled={isRunning}
          />
        </div>
        {#if tierMeta.family === 'v1'}
          <Switch
            bind:checked={cameraFixed}
            label="📷 Fijar cámara"
            disabled={isRunning}
          />
          <Switch
            bind:checked={safetyChecker}
            label="🛡️ Safety checker (filtro de contenido)"
            disabled={isRunning}
          />
        {/if}
      </Collapsible>

      <CostEstimate {unitPrice} duration={effectiveDuration} />

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
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }

  .tier-row { display: flex; justify-content: flex-start; }

  .creation-mode-row { display: flex; flex-direction: column; gap: 0.6rem; }
  .creation-mode-label { color: var(--text-secondary); font-size: 0.95rem; }
  .creation-mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .creation-mode-btn {
    display: flex; align-items: center; justify-content: center; gap: 0.6rem;
    padding: 0.85rem 1rem; background: var(--surface-pill); border: var(--border-subtle);
    border-radius: var(--radius-card); color: var(--text-secondary);
    font-family: var(--font-sans); font-size: 0.95rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast),
      color var(--transition-fast), transform var(--transition-fast);
  }
  .creation-mode-btn:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.2); color: var(--text-primary); transform: translateY(-1px); }
  .creation-mode-btn.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); border-color: transparent; }
  .creation-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .creation-mode-icon { font-size: 1.15rem; line-height: 1; }
  .creation-mode-text { white-space: nowrap; }

  .form-body { display: flex; flex-direction: column; gap: 1.25rem; }

  .image-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; }
  .image-row > .slot-wrap { flex: 1; min-width: 12rem; display: flex; }
  .image-row > .slot-wrap > :global(.image-slot) { flex: 1; }
  .arrow { color: var(--text-muted); font-size: 1.5rem; align-self: center; }

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
