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
  import { V21_TIERS, V21_DEFAULT_TIER, type V21Tier } from '$lib/kling-v2-1-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type AspectRatio = '16:9' | '9:16' | '1:1';
  type Duration = 5 | 10;
  type CreationMode = 'with-images' | 'text-only';

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }

  function readTierFromUrl(): V21Tier {
    const t = page.url.searchParams.get('tier');
    return V21_TIERS.some((x) => x.value === t) ? (t as V21Tier) : V21_DEFAULT_TIER;
  }

  let tier = $state<V21Tier>(readTierFromUrl());
  let creationMode = $state<CreationMode | null>(null);
  let startImage = $state<ImgState>(emptyImage());
  let tailImage = $state<ImgState>(emptyImage());
  let prompt = $state('');
  let duration = $state<Duration>(5);
  let aspectRatio = $state<AspectRatio>('16:9');

  let negativePrompt = $state('');
  let cfgScale = $state(0.5);
  let advancedOpen = $state(false);

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

  // Sólo master soporta t2v. Si el usuario está en text-only y cambia a otro tier, forzamos i2v.
  $effect(() => {
    if (tier !== 'master' && creationMode === 'text-only') {
      creationMode = 'with-images';
    }
  });

  const supportsTextOnly = $derived(tier === 'master');
  const supportsTail = $derived(tier === 'pro');

  const hasStartImage = $derived(!!startImage.file);
  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(
    task === 'i2v'
      ? `/api/kling/v2.1/image-to-video-${tier}`
      : `/api/kling/v2.1/text-to-video-master`
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

  const ALL_ENDPOINTS = [
    'fal-ai/kling-video/v2.1/master/text-to-video',
    'fal-ai/kling-video/v2.1/master/image-to-video',
    'fal-ai/kling-video/v2.1/pro/image-to-video',
    'fal-ai/kling-video/v2.1/standard/image-to-video'
  ];
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m));
  });
  const currentEndpointModel = $derived(
    creationMode === 'with-images'
      ? `fal-ai/kling-video/v2.1/${tier}/image-to-video`
      : `fal-ai/kling-video/v2.1/master/text-to-video`
  );
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 }
  ];

  const durationOptions: { value: Duration; label: string }[] = [
    { value: 5, label: '5s' },
    { value: 10, label: '10s' }
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
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
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
        if (supportsTail && tailImage.file && !tailImage.url) {
          tailImage.url = await uploadFile(tailImage.file);
        }
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        duration
      };
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      if (cfgScale !== 0.5) payload.cfg_scale = cfgScale;

      if (creationMode === 'with-images') {
        payload.image_url = startImage.url;
        if (supportsTail && tailImage.url) payload.tail_image_url = tailImage.url;
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
      if (tailImage.preview) URL.revokeObjectURL(tailImage.preview);
    };
  });
</script>

<BackButton href="/kling" label="Kling" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Kling - v2.1
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
      options={V21_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
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
        disabled={isRunning || !supportsTextOnly}
        title={!supportsTextOnly ? 'Sólo Master soporta text-to-video' : ''}
      >
        <span class="creation-mode-icon">✍️</span>
        <span class="creation-mode-text">Solo texto</span>
      </button>
    </div>
    {#if !supportsTextOnly}
      <span class="hint-text">Standard y Pro sólo soportan image-to-video. Cambia a Master para texto.</span>
    {/if}
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
          {#if hasStartImage && supportsTail}
            <span class="arrow" aria-hidden="true" transition:fade={{ duration: 150 }}>→</span>
            <div class="slot-wrap" transition:slide={{ duration: 200, axis: 'x' }}>
              <ImageSlot
                bind:state={tailImage}
                disabled={isRunning}
                placeholder="Tail image"
                placeholderHint="(opcional, sólo Pro)"
                optional
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if creationMode === 'text-only'}
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
        placeholder={creationMode === 'with-images' ? 'Describe el movimiento / acción...' : 'Describe el video que quieres generar...'}
        rows={6}
        disabled={isRunning}
      />

      <div class="duration-row">
        <span class="field-label">Duración</span>
        <div class="duration-chips">
          {#each durationOptions as opt}
            <button
              type="button"
              class="duration-chip"
              class:active={duration === opt.value}
              onclick={() => (duration = opt.value)}
              disabled={isRunning}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <Collapsible bind:open={advancedOpen} title="Avanzado">
        <div class="field">
          <label class="field-label" for="neg-prompt-21">Prompt negativo (qué evitar)</label>
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

      <CostEstimate {unitPrice} {duration} />

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
  .creation-mode-btn:hover:not(:disabled) { border-color: rgba(255,255,255,0.2); color: var(--text-primary); transform: translateY(-1px); }
  .creation-mode-btn.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); border-color: transparent; }
  .creation-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .creation-mode-icon { font-size: 1.15rem; line-height: 1; }
  .creation-mode-text { white-space: nowrap; }

  .hint-text { color: var(--text-muted); font-size: 0.8rem; }

  .form-body { display: flex; flex-direction: column; gap: 1.25rem; }

  .image-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: stretch; }
  .slot-wrap { flex: 1; min-width: 12rem; display: flex; }
  .slot-wrap > :global(.image-slot) { flex: 1; }
  .arrow { color: var(--text-muted); font-size: 1.5rem; align-self: center; }

  .duration-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .duration-chips { display: flex; gap: 0.4rem; padding: 0.3rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill); }
  .duration-chip {
    padding: 0.4rem 0.95rem; background: transparent; border: none; border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.88rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .duration-chip:hover:not(:disabled) { color: var(--text-primary); }
  .duration-chip.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); }
  .duration-chip:disabled { opacity: 0.5; cursor: not-allowed; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.95rem; }

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
