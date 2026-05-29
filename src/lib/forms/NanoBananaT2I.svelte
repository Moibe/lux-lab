<script lang="ts">
  import { fly, fade } from 'svelte/transition';
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
  import {
    NANO_BANANA_ASPECT_RATIOS,
    NANO_BANANA_OUTPUT_FORMATS,
    NANO_BANANA_SAFETY_TOLERANCES,
    NANO_BANANA_DEFAULTS,
    type NanoBananaAspectRatio,
    type NanoBananaOutputFormat,
    type NanoBananaSafetyTolerance,
    type NanoBananaT2IBody
  } from '@moibe/falai-nucleo';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

  const ENDPOINT_ID = 'fal-ai/nano-banana';
  const MAX_POLLS = 300;
  const FAILURE_STATUSES = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']);
  const IN_PROGRESS_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS', 'PENDING']);

  let prompt = $state('');
  let aspectRatio = $state<NanoBananaAspectRatio>(NANO_BANANA_DEFAULTS.t2i_aspect_ratio);
  let numImages = $state<number>(NANO_BANANA_DEFAULTS.num_images);
  let outputFormat = $state<NanoBananaOutputFormat>(NANO_BANANA_DEFAULTS.output_format);
  let safetyTolerance = $state<NanoBananaSafetyTolerance>(NANO_BANANA_DEFAULTS.safety_tolerance);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let imageUrl = $state<string | null>(null);
  let allImageUrls = $state<string[]>([]);
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

  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap([ENDPOINT_ID]).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[ENDPOINT_ID]?.unit_price ?? null);

  const aspectOptions = NANO_BANANA_ASPECT_RATIOS.map((v) => ({ value: v, label: v }));
  const formatOptions = NANO_BANANA_OUTPUT_FORMATS.map((v) => ({ value: v, label: v.toUpperCase() }));
  const safetyOptions = NANO_BANANA_SAFETY_TOLERANCES.map((v) => ({ value: v, label: v }));

  function reset() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    logs = [];
    imageUrl = null;
    allImageUrls = [];
    errorMessage = null;
  }

  function buildPayload(seedValue: number | null): NanoBananaT2IBody {
    return {
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio,
      num_images: numImages,
      output_format: outputFormat,
      safety_tolerance: safetyTolerance,
      ...(seedValue !== null ? { seed: seedValue } : {})
    };
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (phase !== 'idle' && phase !== 'done' && phase !== 'error') return;

    if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }

    reset();
    try {
      const seedNum = parseInt(seed, 10);
      const seedValue = !isNaN(seedNum) && seedNum >= 0 ? seedNum : null;
      const payload = buildPayload(seedValue);

      phase = 'submitting';
      const subRes = await fetch('/api/nano-banana/t2i/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      let pollCount = 0;
      const poll = async () => {
        if (pollCount++ >= MAX_POLLS) {
          errorMessage = 'Polling agotado — el trabajo tardó demasiado.';
          phase = 'error';
          return;
        }
        const r = await fetch(
          `/api/nano-banana/t2i/status?id=${encodeURIComponent(request_id)}`
        );
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) {
          logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        }

        const upstreamStatus =
          typeof data.status === 'string' ? data.status.toUpperCase() : '';

        if (upstreamStatus === 'COMPLETED') {
          const imgs = data.result?.images;
          const extracted: string[] = Array.isArray(imgs)
            ? imgs
                .map((im: { url?: string }) => im?.url)
                .filter((u): u is string => typeof u === 'string' && u.length > 0)
            : [];
          if (extracted.length === 0) {
            errorMessage = 'La API devolvió COMPLETED pero sin imágenes válidas.';
            phase = 'error';
            return;
          }
          allImageUrls = extracted;
          imageUrl = extracted[0];
          phase = 'done';
          return;
        }
        if (FAILURE_STATUSES.has(upstreamStatus)) {
          errorMessage =
            (typeof data.error === 'string' && data.error) ||
            (typeof data.message === 'string' && data.message) ||
            `La generación falló (estado: ${upstreamStatus}).`;
          phase = 'error';
          return;
        }
        if (!IN_PROGRESS_STATUSES.has(upstreamStatus) && upstreamStatus !== '') {
          errorMessage = `Estado inesperado del trabajo: ${upstreamStatus}.`;
          phase = 'error';
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
</script>

<BackButton href="/nano-banana/legacy" label="Nano Banana legacy" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Nano Banana - Text to Image
</h1>

<p class="lede" in:fade={{ delay: 750, duration: 400 }} out:fade={{ duration: 200 }}>
  Generación de imagen desde texto con Google Gemini 2.5 Flash Image.
</p>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <ChipGroup
    bind:value={aspectRatio}
    options={aspectOptions}
    label="Aspect ratio:"
    disabled={isRunning}
  />

  <Prompt
    bind:value={prompt}
    placeholder="Describe la imagen que quieres generar..."
    rows={6}
    maxlength={5000}
    disabled={isRunning}
  />

  <Slider
    bind:value={numImages}
    min={1}
    max={4}
    label="Número de imágenes"
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
    <div class="field">
      <span class="field-label">Safety tolerance (1=estricto, 6=permisivo)</span>
      <ChipGroup
        bind:value={safetyTolerance}
        options={safetyOptions}
        disabled={isRunning}
      />
    </div>
    <div class="field">
      <label class="field-label" for="seed">Seed (opcional)</label>
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
  </Collapsible>

  <CostEstimate {unitPrice} duration={numImages} />

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

  {#if phase === 'done' && allImageUrls.length > 1}
    <div class="extra-images" transition:fade={{ duration: 200 }}>
      <span class="field-label">Imágenes adicionales ({allImageUrls.length - 1})</span>
      <div class="extra-grid">
        {#each allImageUrls.slice(1) as url, i}
          <a href={url} target="_blank" rel="noopener" class="extra-thumb">
            <img src={url} alt={`Resultado ${i + 2}`} />
          </a>
        {/each}
      </div>
    </div>
  {/if}
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
  .extra-images {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .extra-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.6rem;
  }
  .extra-thumb {
    display: block;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 8px;
    border: var(--border-subtle);
  }
  .extra-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--transition-fast);
  }
  .extra-thumb:hover img {
    transform: scale(1.04);
  }
</style>
