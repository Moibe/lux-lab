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
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import {
    FLUX_IMAGE_SIZE_PRESETS,
    FLUX_PULID_DEFAULTS,
    FLUX_PULID_MAX_SEQ_LENGTHS,
    type FluxImageSizePreset,
    type FluxPulidMaxSeqLength
  } from '@moibe/falai-nucleo';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';

  const FLUX_PULID_ENDPOINT = 'fal-ai/flux-pulid';

  function emptyImage(): ImageSlotState {
    return { file: null, preview: null, url: null };
  }

  let referenceImage = $state<ImageSlotState>(emptyImage());
  let prompt = $state('');
  let negativePrompt = $state('');
  let imageSize = $state<FluxImageSizePreset>('square_hd');
  let idWeight = $state<number>(FLUX_PULID_DEFAULTS.id_weight);
  let numInferenceSteps = $state<number>(FLUX_PULID_DEFAULTS.num_inference_steps);
  let guidanceScale = $state<number>(FLUX_PULID_DEFAULTS.guidance_scale);
  let trueCfg = $state<number>(FLUX_PULID_DEFAULTS.true_cfg);
  let maxSeqLength = $state<FluxPulidMaxSeqLength>(FLUX_PULID_DEFAULTS.max_sequence_length);
  let safetyChecker = $state(FLUX_PULID_DEFAULTS.enable_safety_checker);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let imageUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo imagen de referencia...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando imagen...',
    done: '¡Listo!',
    error: 'Error'
  };

  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap([FLUX_PULID_ENDPOINT]).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[FLUX_PULID_ENDPOINT]?.unit_price ?? null);

  const sizeOptions = FLUX_IMAGE_SIZE_PRESETS.map((s) => ({
    value: s,
    label: s.replace(/_/g, ' ')
  }));
  const maxSeqOptions = FLUX_PULID_MAX_SEQ_LENGTHS.map((v) => ({
    value: v,
    label: v
  }));

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
    if (!referenceImage.file && !referenceImage.url) {
      errorMessage = 'Sube una imagen de referencia (cara a preservar).';
      phase = 'error';
      return;
    }

    reset();
    try {
      if (!referenceImage.url && referenceImage.file) {
        phase = 'uploading';
        referenceImage.url = await uploadFile(referenceImage.file);
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        reference_image_url: referenceImage.url,
        image_size: imageSize,
        id_weight: idWeight,
        num_inference_steps: numInferenceSteps,
        guidance_scale: guidanceScale,
        true_cfg: trueCfg,
        max_sequence_length: maxSeqLength,
        enable_safety_checker: safetyChecker
      };
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

      phase = 'submitting';
      const subRes = await fetch('/api/flux/pulid/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(
          `/api/flux/pulid/status?id=${encodeURIComponent(request_id)}`
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
    if (referenceImage.preview) URL.revokeObjectURL(referenceImage.preview);
  });
</script>

<BackButton href="/flux" label="Flux" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Flux - PuLID
</h1>

<p class="lede">
  Sube una foto de cara y describe la escena. PuLID preserva la identidad facial
  mientras varía el contexto.
</p>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="field">
    <span class="field-label">Imagen de referencia (cara)</span>
    <ImageSlot
      bind:state={referenceImage}
      disabled={isRunning}
      placeholder="Foto de cara"
      placeholderHint="(JPEG/PNG/WEBP, una sola cara, vista frontal)"
      minHeight="12rem"
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
    placeholder="Describe la escena donde quieres ver al personaje..."
    rows={6}
    maxlength={5000}
    disabled={isRunning}
  />

  <Slider
    bind:value={idWeight}
    min={0}
    max={2}
    step={0.05}
    label="Peso de identidad (id_weight)"
    disabled={isRunning}
  />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
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
    <Slider
      bind:value={numInferenceSteps}
      min={4}
      max={50}
      label="Inference steps"
      disabled={isRunning}
    />
    <Slider
      bind:value={guidanceScale}
      min={1}
      max={10}
      step={0.5}
      label="Guidance scale"
      disabled={isRunning}
    />
    <Slider
      bind:value={trueCfg}
      min={1}
      max={5}
      step={0.5}
      label="True CFG"
      disabled={isRunning}
    />
    <div class="field">
      <span class="field-label">Max sequence length</span>
      <ChipGroup
        bind:value={maxSeqLength}
        options={maxSeqOptions}
        disabled={isRunning}
      />
    </div>
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
  .lede {
    margin-top: 0.5rem;
    max-width: min(700px, 92vw);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .form {
    margin-top: 2rem;
    width: min(700px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
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
