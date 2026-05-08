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
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import RichElementsList from '$lib/form/RichElementsList.svelte';
  import type { RichElement } from '$lib/form/RichElementsList.svelte';
  import { O3_TIERS, O3_DEFAULT_TIER, type O3Tier } from '$lib/kling-o3-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type Shot = { prompt: string; duration: number };
  type AspectRatio = '16:9' | '9:16' | '1:1';

  function emptyImage(): ImgState {
    return { file: null, preview: null, url: null };
  }

  function readTierFromUrl(): O3Tier {
    const t = page.url.searchParams.get('tier');
    return O3_TIERS.some((x) => x.value === t) ? (t as O3Tier) : O3_DEFAULT_TIER;
  }

  let startImage = $state<ImgState>(emptyImage());
  let endImage = $state<ImgState>(emptyImage());
  let prompt = $state('');
  let multiShotMode = $state(false);
  let shots = $state<Shot[]>([{ prompt: '', duration: 5 }]);
  let duration = $state(5);
  let generateAudio = $state(true);
  let aspectRatio = $state<AspectRatio>('16:9');

  let negativePrompt = $state('');
  let cfgScale = $state(0.5);
  let advancedOpen = $state(false);

  let elements = $state<RichElement[]>([]);
  let elementsOpen = $state(false);

  let lastFocused = $state<HTMLTextAreaElement | null>(null);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  let tier = $state<O3Tier>(readTierFromUrl());

  $effect(() => {
    const url = new URL(page.url);
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      replaceState(url, page.state);
    }
  });

  type CreationMode = 'with-images' | 'text-only';
  let creationMode = $state<CreationMode | null>(null);

  const hasStartImage = $derived(!!startImage.file);
  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(
    task === 'i2v'
      ? `/api/kling/o3/image-to-video-${tier}`
      : `/api/kling/o3/text-to-video-${tier}`
  );

  const isRunning = $derived(
    phase === 'uploading' || phase === 'submitting' || phase === 'polling'
  );

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    uploading: 'Subiendo imagenes...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const totalShotDuration = $derived(shots.reduce((s, sh) => s + sh.duration, 0));

  const ALL_ENDPOINTS = [
    'fal-ai/kling-video/o3/4k/image-to-video',
    'fal-ai/kling-video/o3/pro/image-to-video',
    'fal-ai/kling-video/o3/standard/image-to-video',
    'fal-ai/kling-video/o3/4k/text-to-video',
    'fal-ai/kling-video/o3/pro/text-to-video',
    'fal-ai/kling-video/o3/standard/text-to-video'
  ];
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const currentEndpointModel = $derived(
    creationMode === 'with-images'
      ? `fal-ai/kling-video/o3/${tier}/image-to-video`
      : `fal-ai/kling-video/o3/${tier}/text-to-video`
  );
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);
  const totalDuration = $derived(multiShotMode ? totalShotDuration : duration);

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

  function insertChip(text: string) {
    const ta = lastFocused;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function addShot() {
    shots.push({ prompt: '', duration: 5 });
  }

  function removeShot(i: number) {
    if (shots.length > 1) shots.splice(i, 1);
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

    if (multiShotMode) {
      if (shots.some((s) => !s.prompt.trim())) {
        errorMessage = 'Cada shot necesita un prompt.';
        phase = 'error';
        return;
      }
    } else if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }

    if (creationMode === 'with-images' && !startImage.file) {
      errorMessage = 'Subí una imagen inicial para usar "Imágenes y texto".';
      phase = 'error';
      return;
    }
    if (creationMode === 'with-images' && elements.some((el) => !el.frontal.file)) {
      errorMessage = 'Cada elemento necesita imagen frontal.';
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
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (!el.frontal.url && el.frontal.file) el.frontal.url = await uploadFile(el.frontal.file);
          for (let j = 0; j < el.refs.length; j++) {
            if (!el.refs[j].url && el.refs[j].file) el.refs[j].url = await uploadFile(el.refs[j].file!);
          }
        }
      }

      const payload: Record<string, unknown> = {
        generate_audio: generateAudio
      };
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      if (cfgScale !== 0.5) payload.cfg_scale = cfgScale;
      if (multiShotMode) {
        payload.multi_prompt = shots.map((s) => ({
          prompt: s.prompt.trim(),
          duration: s.duration
        }));
      } else {
        payload.prompt = prompt.trim();
        payload.duration = duration;
      }

      if (creationMode === 'with-images') {
        payload.image_url = startImage.url;
        if (endImage.url) payload.end_image_url = endImage.url;
        if (elements.length > 0) {
          payload.elements = elements.map((el) => ({
            frontal_image_url: el.frontal.url!,
            ...(el.refs.length > 0 ? { reference_image_urls: el.refs.map((r) => r.url!) } : {})
            // voice_id deshabilitado en i2v por ahora — no se manda al payload
          }));
        }
      } else {
        payload.aspect_ratio = aspectRatio;
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
        const statRes = await fetch(
          `${endpointPath}/status?id=${encodeURIComponent(request_id)}`
        );
        if (!statRes.ok) throw new Error(`Status falló: ${await statRes.text()}`);
        const data = await statRes.json();
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
      elements.forEach((el) => {
        if (el.frontal.preview) URL.revokeObjectURL(el.frontal.preview);
        el.refs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
      });
    };
  });
</script>

<BackButton href="/kling/o3" label="Kling - o3" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Kling - o3 - Image / Text to Video
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
      options={O3_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Calidad:"
      disabled={isRunning}
    />
  </div>

  <!-- Creation mode picker: explicit choice up front -->
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

  <!-- Image row: only in 'with-images' mode -->
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

  <!-- Aspect ratio: only in 'text-only' mode -->
  {#if creationMode === 'text-only'}
    <div transition:slide={{ duration: 200 }}>
      <AspectRatioPicker
        bind:value={aspectRatio}
        options={aspectOptions}
        disabled={isRunning}
      />
    </div>
  {/if}

  <Switch
    bind:checked={multiShotMode}
    label="🎬 Modo cinematográfico (multi-shot)"
    disabled={isRunning}
  />

  {#if creationMode === 'with-images' && elements.length > 0}
    <div class="chips" transition:slide={{ duration: 200 }}>
      <span class="chips-label">Insertar:</span>
      {#each elements as _, i}
        <button
          type="button"
          class="chip"
          onclick={() => insertChip(`@Element${i + 1}`)}
          disabled={isRunning}
        >@Element{i + 1}</button>
      {/each}
    </div>
  {/if}

  {#if !multiShotMode}
    <div transition:slide={{ duration: 200 }}>
      <Prompt
        bind:value={prompt}
        placeholder="Describe el video que quieres generar..."
        rows={6}
        disabled={isRunning}
        onfocusEvent={(e) => (lastFocused = e.currentTarget)}
      />
      <div class="duration-row">
        <Slider
          bind:value={duration}
          min={3}
          max={15}
          label="Duración"
          suffix="s"
          disabled={isRunning}
        />
      </div>
    </div>
  {:else}
    <div class="shots" transition:slide={{ duration: 200 }}>
      {#each shots as shot, i (i)}
        <div class="shot-card" transition:slide={{ duration: 200 }}>
          <div class="shot-head">
            <span class="shot-num">Shot {i + 1}</span>
            {#if shots.length > 1}
              <button
                type="button"
                class="shot-remove"
                aria-label="Quitar shot"
                onclick={() => removeShot(i)}
                disabled={isRunning}>×</button>
            {/if}
          </div>
          <Prompt
            bind:value={shots[i].prompt}
            placeholder={`Describe el shot ${i + 1}...`}
            rows={3}
            small
            disabled={isRunning}
            onfocusEvent={(e) => (lastFocused = e.currentTarget)}
          />
          <Slider
            bind:value={shots[i].duration}
            min={1}
            max={15}
            label="Duración"
            suffix="s"
            disabled={isRunning}
          />
        </div>
      {/each}
      <button type="button" class="add-shot" onclick={addShot} disabled={isRunning}>
        + Añadir shot
      </button>
      <p class="total-time">Total: <strong>{totalShotDuration}s</strong></p>
    </div>
  {/if}

  <Switch
    bind:checked={generateAudio}
    label="🔊 Audio nativo (ES / EN)"
    disabled={isRunning}
  />

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
    <Slider
      bind:value={cfgScale}
      min={0}
      max={1}
      step={0.05}
      label="Fidelidad al prompt"
      leftHint="creativo / libre"
      rightHint="literal / estricto"
      disabled={isRunning}
    />
  </Collapsible>

  {#if creationMode === 'with-images'}
    <div transition:slide={{ duration: 200 }}>
      <Collapsible bind:open={elementsOpen} title="Elementos referenciados" icon="🧩">
        <p class="elements-help">
          Cada elemento: <strong>imagen frontal</strong> + opcionalmente <strong>referencias</strong> de estilo/apariencia. Posicional: <code>@Element1</code> = el primero, <code>@Element2</code> = el segundo. Aparecen como chips clickeables arriba del prompt.
        </p>
        <RichElementsList bind:elements disabled={isRunning} voiceIdMode="pending" />
      </Collapsible>
    </div>
  {/if}

  {#if creationMode}
    <div transition:fade={{ duration: 150 }}>
      <CostEstimate {unitPrice} duration={totalDuration} audio={generateAudio} />
    </div>
  {/if}

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

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .chips-label {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-right: 0.25rem;
  }
  .chip {
    padding: 0.3rem 0.7rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast),
      transform var(--transition-fast);
  }
  .chip:hover:not(:disabled) {
    background: var(--accent);
    color: #fff;
    transform: translateY(-1px);
    box-shadow: var(--accent-shadow);
  }

  .duration-row {
    margin-top: 1rem;
  }

  .shots {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .shot-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  .shot-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .shot-num {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .shot-remove {
    width: 28px;
    height: 28px;
    background: transparent;
    border: var(--border-subtle);
    border-radius: 50%;
    color: var(--text-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .shot-remove:hover:not(:disabled) {
    color: #fca5a5;
    border-color: #fca5a5;
  }
  .add-shot {
    padding: 0.65rem 1rem;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-card);
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-shot:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-primary);
  }
  .total-time {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    text-align: right;
  }
  .total-time strong {
    color: var(--text-primary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .field-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .elements-help {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .elements-help code {
    padding: 0.1rem 0.4rem;
    background: var(--surface-pill);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
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
