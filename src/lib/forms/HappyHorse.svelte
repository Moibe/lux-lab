<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Switch from '$lib/form/Switch.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type Resolution = '720p' | '1080p';
  type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  type CreationMode = 'with-images' | 'text-only';

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }

  let creationMode = $state<CreationMode | null>(null);
  let image = $state<ImgState>(emptyImage());
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<Resolution>('1080p');
  let duration = $state(5);
  let seed = $state<string>('');
  let safetyChecker = $state(true);
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo imagen...', submitting: 'Enviando trabajo...',
    polling: 'Generando video...', done: '¡Listo!', error: 'Error'
  };

  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(
    task === 'i2v' ? '/api/happy-horse/image-to-video' : '/api/happy-horse/text-to-video'
  );

  // Pricing — fetch ambos endpoints, usa el activo
  const ALL_ENDPOINTS = [
    'alibaba/happy-horse/image-to-video',
    'alibaba/happy-horse/text-to-video'
  ];
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m)); });
  const currentEndpointModel = $derived(
    task === 'i2v' ? 'alibaba/happy-horse/image-to-video' : 'alibaba/happy-horse/text-to-video'
  );
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 },
    { value: '4:3', label: '4:3', w: 32, h: 24 },
    { value: '3:4', label: '3:4', w: 24, h: 32 }
  ];

  const resolutionOptions: { value: Resolution; label: string }[] = [
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' }
  ];

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; videoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (creationMode === 'with-images') {
      if (!image.file) { errorMessage = 'Sube una imagen para "Imágenes y texto".'; phase = 'error'; return; }
    } else {
      if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    }
    reset();
    try {
      if (creationMode === 'with-images') {
        phase = 'uploading';
        if (!image.url && image.file) image.url = await uploadFile(image.file);
      }

      const payload: Record<string, unknown> = {
        resolution,
        duration,
        enable_safety_checker: safetyChecker
      };
      if (creationMode === 'with-images') {
        payload.image_url = image.url;
        if (prompt.trim()) payload.prompt = prompt.trim();
      } else {
        payload.prompt = prompt.trim();
        payload.aspect_ratio = aspectRatio;
      }
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;

      phase = 'submitting';
      const subRes = await fetch(`${endpointPath}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${endpointPath}/status?id=${encodeURIComponent(request_id)}`);
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        if (data.status === 'COMPLETED') { videoUrl = data.result?.video?.url ?? null; phase = 'done'; return; }
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
  });
</script>

<BackButton href="/happy-horse" label="Happy Horse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Happy Horse - Image / Text to Video
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
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
        <ImageSlot
          bind:state={image}
          disabled={isRunning}
          placeholder="Imagen base"
          placeholderHint="(JPEG/PNG/BMP/WEBP, min 300px)"
          minHeight="11rem"
        />
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
        placeholder={creationMode === 'with-images' ? 'Prompt opcional (hasta 2500 caracteres)...' : 'Describe el video (hasta 2500 caracteres)...'}
        rows={creationMode === 'with-images' ? 5 : 6}
        small={creationMode === 'with-images'}
        maxlength={2500}
        disabled={isRunning}
      />

      <Slider bind:value={duration} min={3} max={15} label="Duración" suffix="s" disabled={isRunning} />

      <Collapsible bind:open={advancedOpen} title="Avanzado">
        <div class="field">
          <label class="field-label" for="seed">Seed (opcional, para reproducir output)</label>
          <input id="seed" type="number" min="0" max="2147483647" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
        </div>
        <Switch bind:checked={safetyChecker} label="🛡️ Safety checker (filtro de contenido)" disabled={isRunning} />
      </Collapsible>

      <CostEstimate {unitPrice} {duration} />

      <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

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
