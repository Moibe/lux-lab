<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import {
    FLUX_TIERS,
    FLUX_DEFAULT_TIER,
    FLUX_IMAGE_SIZE_PRESETS,
    FLUX_OUTPUT_FORMATS,
    type FluxImageSizePreset,
    type FluxOutputFormat
  } from '$lib/flux-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

  let tierSlug = $state<string>(FLUX_DEFAULT_TIER);
  const tier = $derived(FLUX_TIERS.find((t) => t.value === tierSlug) ?? FLUX_TIERS[0]);

  let prompt = $state('');
  let imageSize = $state<FluxImageSizePreset>('landscape_16_9');
  let outputFormat = $state<FluxOutputFormat>('jpeg');
  let safetyTolerance = $state<number>(2);
  let safetyChecker = $state(true);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let imageUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    submitting: 'Enviando trabajo...',
    polling: 'Generando imagen...',
    done: '¡Listo!',
    error: 'Error'
  };

  const endpointPath = $derived(`/api/flux/${tierSlug}/text-to-image`);
  const currentEndpointModel = $derived(tier.endpoints.t2i);

  const ALL_ENDPOINTS = FLUX_TIERS.map((t) => t.endpoints.t2i).filter(
    (x): x is string => !!x
  );
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(
    currentEndpointModel ? priceMap[currentEndpointModel]?.unit_price ?? null : null
  );

  const tierOptions = $derived(
    FLUX_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))
  );

  const sizeOptions = FLUX_IMAGE_SIZE_PRESETS.map((s) => ({
    value: s,
    label: s.replace(/_/g, ' ')
  }));
  const formatOptions = FLUX_OUTPUT_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));

  function reset() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    logs = [];
    imageUrl = null;
    errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }

    reset();
    try {
      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        image_size: imageSize,
        output_format: outputFormat,
        safety_tolerance: safetyTolerance,
        enable_safety_checker: safetyChecker
      };
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

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
          imageUrl =
            data.result?.images?.[0]?.url ?? data.result?.image?.url ?? null;
          phase = 'done';
          return;
        }
        pollTimer = setTimeout(poll, 2000);
      };
      poll();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      phase = 'error';
    }
  }

  $effect(() => () => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  let safetyToleranceStr = $state('2');
  $effect(() => { safetyToleranceStr = String(safetyTolerance); });
  $effect(() => { const n = parseInt(safetyToleranceStr, 10); if (!isNaN(n)) safetyTolerance = n; });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Flux - Text to Image
</h1>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="model-row">
    <Dropdown
      bind:value={tierSlug}
      options={tierOptions}
      label="Modelo:"
      disabled={isRunning}
    />
  </div>

  <ChipGroup
    bind:value={imageSize}
    options={sizeOptions}
    label="Tamaño:"
    disabled={isRunning}
  />

  <Prompt
    bind:value={prompt}
    placeholder="Describe la imagen que quieres generar..."
    rows={6}
    maxlength={5000}
    disabled={isRunning}
  />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <span class="field-label">Formato de salida</span>
      <ChipGroup
        bind:value={outputFormat}
        options={formatOptions}
        disabled={isRunning}
      />
    </div>
    <Slider
      bind:value={safetyTolerance}
      min={1}
      max={5}
      label="Tolerancia de seguridad"
      disabled={isRunning}
    />
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
    <Switch
      bind:checked={safetyChecker}
      label="🛡️ Safety checker (filtro de contenido)"
      disabled={isRunning}
    />
  </Collapsible>

  <CostEstimate {unitPrice} duration={1} />

  <button class="submit" type="submit" disabled={isRunning}>
    {isRunning ? phaseLabel[phase] : 'Generar'}
  </button>

  <StatusPanel
    {phase}
    phaseLabel={phaseLabel[phase]}
    {errorMessage}
    {logs}
    resultUrl={imageUrl}
    resultLabel="Descargar imagen"
    asImage
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
  .model-row {
    display: flex;
    justify-content: flex-start;
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
