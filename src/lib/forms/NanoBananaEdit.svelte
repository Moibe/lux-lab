<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import {
    NANO_BANANA_EDIT_ASPECT_RATIOS,
    NANO_BANANA_OUTPUT_FORMATS,
    NANO_BANANA_SAFETY_TOLERANCES,
    NANO_BANANA_DEFAULTS,
    type NanoBananaEditAspectRatio,
    type NanoBananaOutputFormat,
    type NanoBananaSafetyTolerance,
    type NanoBananaEditBody
  } from '@moibe/falai-nucleo';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';

  const ENDPOINT_ID = 'fal-ai/nano-banana/edit';
  const MAX_IMAGES = 6;
  const MAX_POLLS = 300;
  const FAILURE_STATUSES = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']);
  const IN_PROGRESS_STATUSES = new Set(['IN_QUEUE', 'IN_PROGRESS', 'PENDING']);

  function emptyImage(): ImageSlotState {
    return { file: null, preview: null, url: null };
  }
  function hasContent(s: ImageSlotState): boolean {
    return !!(s.file || s.url);
  }

  let images = $state<ImageSlotState[]>([emptyImage()]);
  let prompt = $state('');
  let aspectRatio = $state<NanoBananaEditAspectRatio>(NANO_BANANA_DEFAULTS.edit_aspect_ratio);
  let numImages = $state<number>(NANO_BANANA_DEFAULTS.num_images);
  let outputFormat = $state<NanoBananaOutputFormat>(NANO_BANANA_DEFAULTS.output_format);
  let safetyTolerance = $state<NanoBananaSafetyTolerance>(NANO_BANANA_DEFAULTS.safety_tolerance);
  let seed = $state<string>('');
  let advancedOpen = $state(false);
  let tipsOpen = $state(false);

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
    polling: 'Aplicando edit...',
    done: '¡Listo!',
    error: 'Error'
  };

  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap([ENDPOINT_ID]).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[ENDPOINT_ID]?.unit_price ?? null);

  const aspectOptions = NANO_BANANA_EDIT_ASPECT_RATIOS.map((v) => ({ value: v, label: v }));
  const formatOptions = NANO_BANANA_OUTPUT_FORMATS.map((v) => ({ value: v, label: v.toUpperCase() }));
  const safetyOptions = NANO_BANANA_SAFETY_TOLERANCES.map((v) => ({ value: v, label: v }));

  // Sugerencias de prompt-helpers según la doc oficial.
  const promptSnippets = [
    { label: 'Keep identical', text: ' Keep everything else identical.' },
    { label: 'Remove…', text: 'Remove the ' },
    { label: 'Add…', text: 'Add a ' },
    { label: 'Replace…', text: 'Replace the ' },
    { label: 'Swap with ref', text: 'Replace the garment with the one shown in the second image. ' }
  ];

  function appendSnippet(text: string) {
    prompt = (prompt + text).replace(/\s{2,}/g, ' ').trimStart();
  }

  function addImage() {
    if (images.length < MAX_IMAGES) images = [...images, emptyImage()];
  }
  function removeImage(i: number) {
    if (images[i].preview) URL.revokeObjectURL(images[i].preview!);
    images = images.filter((_, idx) => idx !== i);
    if (images.length === 0) images = [emptyImage()];
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

  function buildPayload(imageUrls: string[], seedValue: number | null): NanoBananaEditBody {
    return {
      prompt: prompt.trim(),
      image_urls: imageUrls,
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
      errorMessage = 'Escribe la instrucción del edit.';
      phase = 'error';
      return;
    }
    if (images.filter(hasContent).length === 0) {
      errorMessage = 'Sube al menos 1 imagen.';
      phase = 'error';
      return;
    }

    reset();
    try {
      phase = 'uploading';
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.url && img.file) {
          images[i] = { ...img, url: await uploadFile(img.file) };
        }
      }
      const imageUrls = images
        .filter((img) => img.url)
        .map((img) => img.url!);
      if (imageUrls.length === 0) {
        errorMessage = 'No se pudo subir ninguna imagen.';
        phase = 'error';
        return;
      }

      const seedNum = parseInt(seed, 10);
      const seedValue = !isNaN(seedNum) && seedNum >= 0 ? seedNum : null;
      const payload = buildPayload(imageUrls, seedValue);

      phase = 'submitting';
      const subRes = await fetch('/api/nano-banana/edit/submit', {
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
          `/api/nano-banana/edit/status?id=${encodeURIComponent(request_id)}`
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
    images.forEach((img) => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
  });
</script>

<BackButton href="/nano-banana" label="Nano Banana" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Nano Banana - Edit
</h1>

<p class="lede" in:fade={{ delay: 750, duration: 400 }} out:fade={{ duration: 200 }}>
  Edits quirúrgicos por instrucción: <em>remove / add / swap</em> sin máscaras.
  Sube 1+ imágenes y describe el cambio.
</p>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="field">
    <span class="field-label">
      Imágenes ({images.filter(hasContent).length}/{MAX_IMAGES})
      <small class="muted">— la primera es el sujeto; las demás funcionan como referencia (ej. una prenda a colocar)</small>
    </span>
    <div class="multi-grid">
      {#each images as img, i (i)}
        <div class="ref-card" transition:slide={{ duration: 200, axis: 'x' }}>
          <span class="ref-tag">{i === 0 ? 'subject' : `ref${i}`}</span>
          <ImageSlot
            bind:state={images[i]}
            disabled={isRunning}
            placeholder={i === 0 ? 'Imagen base' : `Referencia ${i}`}
            minHeight="9rem"
          />
          {#if images.length > 1 || img.file || img.url}
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
      {#if images.length < MAX_IMAGES}
        <button
          type="button"
          class="add-card"
          onclick={addImage}
          disabled={isRunning}
        >+ Imagen</button>
      {/if}
    </div>
  </div>

  <Prompt
    bind:value={prompt}
    placeholder='Ej. "Remove the black belt around the waist. Keep everything else identical."'
    rows={6}
    maxlength={5000}
    disabled={isRunning}
  />

  <div class="snippets">
    <span class="snippets-label">Insertar:</span>
    {#each promptSnippets as s}
      <button
        type="button"
        class="chip"
        disabled={isRunning}
        onclick={() => appendSnippet(s.text)}
      >{s.label}</button>
    {/each}
  </div>

  <ChipGroup
    bind:value={aspectRatio}
    options={aspectOptions}
    label="Aspect ratio:"
    disabled={isRunning}
  />

  <Slider
    bind:value={numImages}
    min={1}
    max={4}
    label="Número de imágenes"
    disabled={isRunning}
  />

  <Collapsible bind:open={tipsOpen} title="💡 Tips para edits efectivos (Google)">
    <ul class="tips">
      <li>Frases tipo <em>"Keep everything else identical"</em> evitan cambios colaterales.</li>
      <li>Describe la prenda con detalle: <em>"a brown leather jacket, slim fit"</em> &gt; <em>"a jacket"</em>.</li>
      <li>Para remove, identifica el objeto sin ambigüedad: <em>"remove the black belt around the waist"</em> &gt; <em>"remove the belt"</em>.</li>
      <li>Para swap con referencia: <em>"Replace the garment with the one shown in the second image"</em>.</li>
    </ul>
  </Collapsible>

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
    {isRunning ? phaseLabel[phase] : 'Aplicar edit'}
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
  .muted {
    color: var(--text-muted);
    font-weight: 400;
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

  .snippets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: -0.4rem;
  }
  .snippets-label {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin-right: 0.2rem;
  }
  .chip {
    padding: 0.3rem 0.7rem;
    background: rgba(255, 255, 255, 0.06);
    border: var(--border-subtle);
    border-radius: 999px;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .chip:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-primary);
  }
  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tips {
    margin: 0;
    padding-left: 1.1rem;
    color: var(--text-secondary);
    font-size: 0.85rem;
    line-height: 1.55;
  }
  .tips li {
    margin: 0.25rem 0;
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
