<script lang="ts">
  import { fly, slide } from 'svelte/transition';
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
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import { I2V_VERSIONS, T2V_VERSIONS, PIXVERSE_STYLES, type PixVerseVersion, type PixVerseStyle } from '$lib/pixverse-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type Resolution = '360p' | '540p' | '720p' | '1080p';
  type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  type CreationMode = 'with-images' | 'text-only';

  let creationMode = $state<CreationMode | null>(null);
  let version = $state<PixVerseVersion>('v6');
  let image = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let resolution = $state<Resolution>('720p');
  let duration = $state(5);
  let style = $state<'' | PixVerseStyle>('');
  let negativePrompt = $state('');
  let seed = $state<string>('');
  let generateAudio = $state(false);
  let multiClip = $state(false);
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

  // v4.5 no tiene text-to-video. Si el user pickea text-only y v4.5, fallback.
  const versionOptions = $derived(creationMode === 'text-only' ? T2V_VERSIONS : I2V_VERSIONS);
  $effect(() => {
    if (creationMode === 'text-only' && version === 'v4.5') version = 'v6';
  });

  // v4.5 no soporta aspect_ratio
  const supportsAspect = $derived(version !== 'v4.5');
  // audio + multi_clip solo en versiones modernas
  const supportsAudio = $derived(version === 'v6' || version === 'v5.6' || version === 'v5.5' || version === 'c1');
  const supportsMultiClip = $derived(version === 'v6' || version === 'v5.5');

  const task = $derived<'i2v' | 't2v'>(creationMode === 'with-images' ? 'i2v' : 't2v');
  const endpointPath = $derived(`/api/pixverse/${version}/${task === 'i2v' ? 'image-to-video' : 'text-to-video'}`);
  const currentEndpointModel = $derived(`fal-ai/pixverse/${version}/${task === 'i2v' ? 'image-to-video' : 'text-to-video'}`);

  // Pre-fetch todos los endpoints relevantes (i2v + t2v de cada versión)
  const ALL_ENDPOINTS = [
    ...I2V_VERSIONS.map((v) => `fal-ai/pixverse/${v.value}/image-to-video`),
    ...T2V_VERSIONS.map((v) => `fal-ai/pixverse/${v.value}/text-to-video`)
  ];
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 },
    { value: '4:3', label: '4:3', w: 32, h: 24 },
    { value: '3:4', label: '3:4', w: 24, h: 32 }
  ];

  const resOptions: { value: Resolution; label: string }[] = [
    { value: '360p', label: '360p' },
    { value: '540p', label: '540p' },
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
    if (!prompt.trim()) { errorMessage = 'Escribe un prompt.'; phase = 'error'; return; }
    if (creationMode === 'with-images' && !image.file) {
      errorMessage = 'Sube una imagen para "Imágenes y texto".'; phase = 'error'; return;
    }
    reset();
    try {
      if (creationMode === 'with-images') {
        phase = 'uploading';
        if (!image.url && image.file) image.url = await uploadFile(image.file);
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        resolution,
        duration
      };
      if (creationMode === 'with-images') payload.image_url = image.url;
      if (supportsAspect && (creationMode === 'text-only' || creationMode === 'with-images')) {
        // En i2v algunas versiones aceptan aspect_ratio, otras no — siempre que el caps lo permita lo mando
        payload.aspect_ratio = aspectRatio;
      }
      if (style) payload.style = style;
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();
      const seedNum = parseInt(seed, 10);
      if (!isNaN(seedNum) && seedNum >= 0) payload.seed = seedNum;
      if (supportsAudio && generateAudio) payload.generate_audio_switch = true;
      if (supportsMultiClip && multiClip) payload.generate_multi_clip_switch = true;

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

<BackButton href="/pixverse" label="PixVerse" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  PixVerse - Image / Text to Video
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="version-row">
    <Dropdown
      bind:value={version}
      options={versionOptions.map((v) => ({ value: v.value, label: v.label, hint: v.hint }))}
      label="Versión:"
      disabled={isRunning}
    />
  </div>

  <ChipGroup bind:value={resolution} options={resOptions} label="Resolución:" disabled={isRunning} />

  <div class="creation-mode-row">
    <span class="creation-mode-label">¿Cómo armarás la toma?</span>
    <div class="creation-mode-options">
      <button type="button" class="creation-mode-btn"
        class:active={creationMode === 'with-images'}
        onclick={() => (creationMode = 'with-images')} disabled={isRunning}>
        <span class="creation-mode-icon">🖼️</span>
        <span class="creation-mode-text">Imágenes y texto</span>
      </button>
      <button type="button" class="creation-mode-btn"
        class:active={creationMode === 'text-only'}
        onclick={() => (creationMode = 'text-only')} disabled={isRunning}>
        <span class="creation-mode-icon">✍️</span>
        <span class="creation-mode-text">Solo texto</span>
      </button>
    </div>
  </div>

  {#if creationMode}
    <div class="form-body" transition:slide={{ duration: 280 }}>
      {#if creationMode === 'with-images'}
        <ImageSlot bind:state={image} disabled={isRunning} placeholder="Imagen base" minHeight="11rem" />
      {/if}

      {#if supportsAspect}
        <div transition:slide={{ duration: 200 }}>
          <AspectRatioPicker bind:value={aspectRatio} options={aspectOptions} label="Formato:" disabled={isRunning} />
        </div>
      {/if}

      <Prompt
        bind:value={prompt}
        placeholder={creationMode === 'with-images' ? 'Describe la animación deseada...' : 'Describe el video...'}
        rows={6}
        disabled={isRunning}
      />

      <Slider bind:value={duration} min={1} max={15} label="Duración" suffix="s" disabled={isRunning} />

      {#if supportsAudio}
        <Switch bind:checked={generateAudio} label="🔊 Generar audio (BGM/SFX/diálogo)" disabled={isRunning} />
      {/if}
      {#if supportsMultiClip}
        <Switch bind:checked={multiClip} label="🎬 Multi-clip con cambios de cámara" disabled={isRunning} />
      {/if}

      <Collapsible bind:open={advancedOpen} title="Avanzado">
        <div class="field">
          <label class="field-label" for="style">Estilo</label>
          <select id="style" bind:value={style} class="select" disabled={isRunning}>
            {#each PIXVERSE_STYLES as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="negative">Prompt negativo (qué evitar)</label>
          <Prompt bind:value={negativePrompt} placeholder="blur, distort, low quality" rows={2} disabled={isRunning} small />
        </div>
        <div class="field">
          <label class="field-label" for="seed">Seed (opcional)</label>
          <input id="seed" type="number" min="0" bind:value={seed} class="seed-input" placeholder="(aleatorio)" disabled={isRunning} />
        </div>
      </Collapsible>

      <CostEstimate {unitPrice} {duration} audio={supportsAudio && generateAudio} />

      <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

      <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
    </div>
  {/if}
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .version-row { display: flex; justify-content: flex-start; }

  .creation-mode-row { display: flex; flex-direction: column; gap: 0.6rem; }
  .creation-mode-label { color: var(--text-secondary); font-size: 0.95rem; }
  .creation-mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .creation-mode-btn {
    display: flex; align-items: center; justify-content: center; gap: 0.6rem;
    padding: 0.85rem 1rem; background: var(--surface-pill); border: var(--border-subtle);
    border-radius: var(--radius-card); color: var(--text-secondary);
    font-family: var(--font-sans); font-size: 0.95rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .creation-mode-btn:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.2); color: var(--text-primary); transform: translateY(-1px); }
  .creation-mode-btn.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); border-color: transparent; }
  .creation-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-body { display: flex; flex-direction: column; gap: 1.25rem; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .seed-input, .select {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .select { font-family: var(--font-sans); }
  .seed-input:focus, .select:focus { border-color: var(--accent); }
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
