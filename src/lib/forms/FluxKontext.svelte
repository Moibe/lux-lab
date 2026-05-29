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
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import {
    FLUX_KONTEXT_TIERS,
    FLUX_KONTEXT_DEFAULT_TIER,
    FLUX_KONTEXT_ASPECT_RATIOS,
    FLUX_KONTEXT_SAFETY_TOLERANCES,
    FLUX_KONTEXT_OUTPUT_FORMATS,
    type FluxKontextTier,
    type FluxKontextAspectRatio,
    type FluxKontextSafetyTolerance,
    type FluxKontextOutputFormat,
    type FluxKontextBody,
    type FluxKontextSingleBody,
    type FluxKontextMultiBody
  } from '@moibe/falai-nucleo';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';

  const MAX_MULTI_IMAGES = 8;
  // Cap defensivo: ~10 min @ 2s entre polls. Si llega aquí, algo está atorado upstream.
  const MAX_POLLS = 300;
  // Estados terminales en negativo que fal/nucleo pueden devolver. Cualquiera distinto
  // de COMPLETED y de los conocidos en-curso se trata como error explícito.
  const FAILURE_STATUSES = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']);
  const IN_PROGRESS_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS', 'PENDING']);

  function emptyImage(): ImageSlotState {
    return { file: null, preview: null, url: null };
  }
  function hasContent(s: ImageSlotState): boolean {
    return !!(s.file || s.url);
  }

  function readTierFromUrl(): FluxKontextTier {
    const t = page.url.searchParams.get('tier');
    return FLUX_KONTEXT_TIERS.some((x) => x.value === t)
      ? (t as FluxKontextTier)
      : FLUX_KONTEXT_DEFAULT_TIER;
  }

  let tierSlug = $state<FluxKontextTier>(readTierFromUrl());
  const tier = $derived(FLUX_KONTEXT_TIERS.find((t) => t.value === tierSlug) ?? FLUX_KONTEXT_TIERS[0]);
  const isMulti = $derived(tier.multi);

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tierSlug) {
      url.searchParams.set('tier', tierSlug);
      replaceState(url, page.state);
    }
  });

  // Estado dual: una imagen única (tiers single) y un array (tiers multi).
  // Al cambiar de tier, se migra suavemente el contenido entre ambos.
  let singleImage = $state<ImageSlotState>(emptyImage());
  let multiImages = $state<ImageSlotState[]>([emptyImage()]);

  // Migración suave entre single<->multi al cambiar tier. La primera corrida
  // del effect sólo captura el valor inicial sin migrar nada.
  let prevIsMulti: boolean | null = null;
  $effect(() => {
    const current = isMulti;
    if (prevIsMulti === null) {
      prevIsMulti = current;
      return;
    }
    if (current === prevIsMulti) return;
    if (current) {
      // single → multi: pasa la imagen única al primer slot del array.
      if (hasContent(singleImage)) {
        multiImages = [singleImage, ...multiImages.filter(hasContent).slice(0, MAX_MULTI_IMAGES - 1)];
        singleImage = emptyImage();
      } else if (multiImages.length === 0) {
        multiImages = [emptyImage()];
      }
    } else {
      // multi → single: toma el primero con contenido (si hay) como singleImage.
      const firstFilled = multiImages.find(hasContent);
      if (firstFilled) {
        singleImage = firstFilled;
        // Las demás se descartan (revocando previews para no leak memory).
        for (const img of multiImages) {
          if (img !== firstFilled && img.preview) URL.revokeObjectURL(img.preview);
        }
        multiImages = [emptyImage()];
      }
    }
    prevIsMulti = current;
  });

  let prompt = $state('');
  let aspectRatio = $state<FluxKontextAspectRatio>('1:1');
  let guidanceScale = $state<number>(3.5);
  let numImages = $state<number>(1);
  let safetyTolerance = $state<FluxKontextSafetyTolerance>('2');
  let outputFormat = $state<FluxKontextOutputFormat>('jpeg');
  let enhancePrompt = $state(false);
  let seed = $state<string>('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let imageUrl = $state<string | null>(null);
  let allImageUrls = $state<string[]>([]);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo imágenes...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando imagen...',
    done: '¡Listo!',
    error: 'Error'
  };

  const ALL_ENDPOINTS = FLUX_KONTEXT_TIERS.map((t) => t.endpoint);
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[tier.endpoint]?.unit_price ?? null);

  const tierOptions = $derived(
    FLUX_KONTEXT_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))
  );

  const aspectMeta: Record<FluxKontextAspectRatio, { w: number; h: number }> = {
    '21:9': { w: 42, h: 18 },
    '16:9': { w: 36, h: 20 },
    '4:3': { w: 32, h: 24 },
    '3:2': { w: 33, h: 22 },
    '1:1': { w: 28, h: 28 },
    '2:3': { w: 22, h: 33 },
    '3:4': { w: 24, h: 32 },
    '9:16': { w: 20, h: 36 },
    '9:21': { w: 18, h: 42 }
  };
  const aspectOptions = FLUX_KONTEXT_ASPECT_RATIOS.map((v) => ({
    value: v,
    label: v,
    w: aspectMeta[v].w,
    h: aspectMeta[v].h
  }));

  const safetyOptions = FLUX_KONTEXT_SAFETY_TOLERANCES.map((v) => ({
    value: v,
    label: v
  }));
  const formatOptions = FLUX_KONTEXT_OUTPUT_FORMATS.map((v) => ({
    value: v,
    label: v.toUpperCase()
  }));

  function addImage() {
    if (multiImages.length < MAX_MULTI_IMAGES) multiImages = [...multiImages, emptyImage()];
  }
  function removeImage(i: number) {
    if (multiImages[i].preview) URL.revokeObjectURL(multiImages[i].preview!);
    multiImages = multiImages.filter((_, idx) => idx !== i);
    if (multiImages.length === 0) multiImages = [emptyImage()];
  }

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
    allImageUrls = [];
    errorMessage = null;
  }

  // Construye el body discriminado según tier. Forzar el retorno como
  // FluxKontextBody hace que TypeScript verifique en compile-time que la rama
  // correcta del union se está armando (image_url string vs image_urls array).
  function buildKontextPayload(opts: {
    isMulti: boolean;
    prompt: string;
    singleUrl: string | null;
    multiUrls: string[];
    aspectRatio: FluxKontextAspectRatio;
    guidanceScale: number;
    numImages: number;
    safetyTolerance: FluxKontextSafetyTolerance;
    outputFormat: FluxKontextOutputFormat;
    enhancePrompt: boolean;
    seed: number | null;
  }): FluxKontextBody {
    const common = {
      prompt: opts.prompt,
      aspect_ratio: opts.aspectRatio,
      guidance_scale: opts.guidanceScale,
      num_images: opts.numImages,
      safety_tolerance: opts.safetyTolerance,
      output_format: opts.outputFormat,
      enhance_prompt: opts.enhancePrompt,
      ...(opts.seed !== null ? { seed: opts.seed } : {})
    };
    if (opts.isMulti) {
      const body: FluxKontextMultiBody = {
        ...common,
        image_urls: opts.multiUrls
      };
      return body;
    }
    if (!opts.singleUrl) {
      // Invariante: el caller debe garantizar singleUrl antes de llamar.
      throw new Error('buildKontextPayload: singleUrl requerido para tier single');
    }
    const body: FluxKontextSingleBody = {
      ...common,
      image_url: opts.singleUrl
    };
    return body;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    // Guard contra doble-submit (clicks rápidos antes de que `disabled` refleje isRunning).
    if (phase !== 'idle' && phase !== 'done' && phase !== 'error') return;

    if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }
    if (isMulti) {
      const filled = multiImages.filter(hasContent);
      if (filled.length === 0) {
        errorMessage = 'Sube al menos 1 imagen de referencia.';
        phase = 'error';
        return;
      }
    } else {
      if (!hasContent(singleImage)) {
        errorMessage = 'Sube una imagen de referencia.';
        phase = 'error';
        return;
      }
    }

    reset();

    // Captura el tier al momento del submit. El dropdown está disabled durante
    // isRunning, pero capturarlo en una constante elimina cualquier riesgo de
    // que el polling termine apuntando a otro endpoint si algo lo desbloquea.
    const tierAtSubmit = tierSlug;
    const isMultiAtSubmit = isMulti;

    try {
      phase = 'uploading';
      if (isMultiAtSubmit) {
        for (let i = 0; i < multiImages.length; i++) {
          const img = multiImages[i];
          if (!img.url && img.file) {
            multiImages[i] = { ...img, url: await uploadFile(img.file) };
          }
        }
      } else {
        if (!singleImage.url && singleImage.file) {
          singleImage = { ...singleImage, url: await uploadFile(singleImage.file) };
        }
      }

      const seedNum = parseInt(seed, 10);
      const seedValue = !isNaN(seedNum) && seedNum >= 0 ? seedNum : null;
      const payload = buildKontextPayload({
        isMulti: isMultiAtSubmit,
        prompt: prompt.trim(),
        singleUrl: singleImage.url,
        multiUrls: multiImages.filter((img) => img.url).map((img) => img.url!),
        aspectRatio,
        guidanceScale,
        numImages,
        safetyTolerance,
        outputFormat,
        enhancePrompt,
        seed: seedValue
      });

      phase = 'submitting';
      const subRes = await fetch(
        `/api/flux/kontext/${encodeURIComponent(tierAtSubmit)}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      let pollCount = 0;
      const poll = async () => {
        if (pollCount++ >= MAX_POLLS) {
          errorMessage = 'Polling agotado — el trabajo tardó demasiado en completarse.';
          phase = 'error';
          return;
        }
        const r = await fetch(
          `/api/flux/kontext/${encodeURIComponent(tierAtSubmit)}/status?id=${encodeURIComponent(request_id)}`
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
          let extracted: string[] = [];
          if (Array.isArray(imgs) && imgs.length > 0) {
            extracted = imgs
              .map((im: { url?: string }) => im?.url)
              .filter((u): u is string => typeof u === 'string' && u.length > 0);
          } else if (typeof data.result?.image?.url === 'string') {
            extracted = [data.result.image.url];
          }
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

        // Status desconocido (ni in-progress ni completado ni de error) → trátalo
        // como error explícito para que el usuario no quede colgado.
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
    if (singleImage.preview) URL.revokeObjectURL(singleImage.preview);
    multiImages.forEach((img) => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
  });
</script>

<BackButton href="/flux" label="Flux" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Flux - Kontext
</h1>

<p class="lede" in:fade={{ delay: 750, duration: 400 }} out:fade={{ duration: 200 }}>
  Image-to-image que preserva identidad. Ideal para lookbooks: misma persona en
  distintos outfits / escenarios.
</p>

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
      label="Tier:"
      disabled={isRunning}
    />
  </div>

  {#if isMulti}
    <div class="field" transition:slide={{ duration: 200 }}>
      <span class="field-label">
        Imágenes de referencia ({multiImages.filter(hasContent).length}/{MAX_MULTI_IMAGES})
      </span>
      <div class="multi-grid">
        {#each multiImages as img, i (i)}
          <div class="ref-card" transition:slide={{ duration: 200, axis: 'x' }}>
            <span class="ref-tag">ref{i + 1}</span>
            <ImageSlot
              bind:state={multiImages[i]}
              disabled={isRunning}
              placeholder={`Imagen ${i + 1}`}
              minHeight="9rem"
            />
            {#if multiImages.length > 1 || img.file || img.url}
              <button
                type="button"
                class="ref-remove"
                aria-label={`Quitar imagen ${i + 1}`}
                disabled={isRunning}
                onclick={() => removeImage(i)}
              >×</button>
            {/if}
          </div>
        {/each}
        {#if multiImages.length < MAX_MULTI_IMAGES}
          <button
            type="button"
            class="add-card"
            onclick={addImage}
            disabled={isRunning}
          >+ Imagen</button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="field" transition:slide={{ duration: 200 }}>
      <span class="field-label">Imagen de referencia</span>
      <ImageSlot
        bind:state={singleImage}
        disabled={isRunning}
        placeholder="Imagen base"
        placeholderHint="(JPEG/PNG/WEBP)"
        minHeight="12rem"
      />
    </div>
  {/if}

  <Prompt
    bind:value={prompt}
    placeholder={isMulti
      ? 'Combina las referencias en una sola escena. Describe outfit, pose, ambiente...'
      : 'Describe la variación que quieres sobre la imagen base (outfit, estilo, escena...).'}
    rows={6}
    maxlength={5000}
    disabled={isRunning}
  />

  <AspectRatioPicker
    bind:value={aspectRatio}
    options={aspectOptions}
    disabled={isRunning}
  />

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <Slider
      bind:value={guidanceScale}
      min={1}
      max={10}
      step={0.5}
      label="Guidance scale"
      disabled={isRunning}
    />
    <Slider
      bind:value={numImages}
      min={1}
      max={4}
      label="Número de imágenes"
      disabled={isRunning}
    />
    <div class="field">
      <span class="field-label">Safety tolerance (1=estricto, 6=permisivo)</span>
      <ChipGroup
        bind:value={safetyTolerance}
        options={safetyOptions}
        disabled={isRunning}
      />
    </div>
    <div class="field">
      <span class="field-label">Formato de salida</span>
      <ChipGroup
        bind:value={outputFormat}
        options={formatOptions}
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
      bind:checked={enhancePrompt}
      label="✨ Enhance prompt (rewrite con LLM)"
      disabled={isRunning}
    />
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

  .multi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.75rem;
  }
  .ref-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .ref-tag {
    align-self: flex-start;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-muted);
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .ref-remove {
    position: absolute;
    top: 1.7rem;
    right: 0.35rem;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
    z-index: 2;
  }
  .ref-remove:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 9rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-card);
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-card:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.35);
    color: var(--text-primary);
  }
  .add-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
