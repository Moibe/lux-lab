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
  import {
    VEO3_TIERS,
    VEO3_TASKS,
    VEO3_DEFAULT_TIER,
    VEO3_DEFAULT_TASK,
    veo3DurationsFor,
    veo3TaskSupported,
    getVeo3Tier,
    allVeo3EndpointIds,
    type Veo3Tier,
    type Veo3Task,
    type Veo3Duration,
    type Veo3Resolution,
    type Veo3AspectRatio
  } from '$lib/veo3-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };

  function emptyImage(): ImgState {
    return { file: null, preview: null, url: null };
  }

  function readTierFromUrl(): Veo3Tier {
    const t = page.url.searchParams.get('tier');
    return VEO3_TIERS.some((x) => x.value === t) ? (t as Veo3Tier) : VEO3_DEFAULT_TIER;
  }

  function readTaskFromUrl(): Veo3Task {
    const t = page.url.searchParams.get('task');
    return VEO3_TASKS.some((x) => x.value === t) ? (t as Veo3Task) : VEO3_DEFAULT_TASK;
  }

  let tier = $state<Veo3Tier>(readTierFromUrl());
  let task = $state<Veo3Task>(readTaskFromUrl());

  const tierMeta = $derived(getVeo3Tier(tier));

  // Si la tier elegida no soporta la task vigente, regreso a t2v.
  $effect(() => {
    if (!veo3TaskSupported(tier, task)) task = 't2v';
  });

  $effect(() => {
    const url = new URL(page.url);
    let changed = false;
    if (url.searchParams.get('tier') !== tier) {
      url.searchParams.set('tier', tier);
      changed = true;
    }
    if (url.searchParams.get('task') !== task) {
      url.searchParams.set('task', task);
      changed = true;
    }
    if (changed) replaceState(url, page.state);
  });

  let prompt = $state('');
  let imageA = $state<ImgState>(emptyImage());
  let imageB = $state<ImgState>(emptyImage());
  let refImages = $state<ImgState[]>([emptyImage()]);

  let aspectRatio = $state<Veo3AspectRatio>('16:9');
  let duration = $state<Veo3Duration>('8s');
  let resolution = $state<Veo3Resolution>('720p');
  let generateAudio = $state(true);

  let negativePrompt = $state('');
  let seedRaw = $state('');
  let autoFix = $state(true);
  let safetyTolerance = $state(4);
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
    uploading: 'Subiendo imágenes...',
    submitting: 'Enviando trabajo...',
    polling: 'Generando video...',
    done: '¡Listo!',
    error: 'Error'
  };

  const availableDurations = $derived(veo3DurationsFor(tier, task));

  // R2V Standard fija "8s"; Lite FLF también. Sincroniza duration cuando cambia el set.
  $effect(() => {
    if (!availableDurations.includes(duration)) duration = availableDurations[availableDurations.length - 1];
  });

  // Si la tier cambia y la resolución actual no aplica, ajusto a la última disponible.
  $effect(() => {
    if (!tierMeta.resolutions.includes(resolution)) {
      resolution = tierMeta.resolutions[tierMeta.resolutions.length - 1];
    }
  });

  // T2V usa solo "16:9"/"9:16"; el resto admite "auto".
  const aspectOptions = $derived(
    task === 't2v'
      ? [
          { value: '16:9' as Veo3AspectRatio, label: '16:9', w: 36, h: 20 },
          { value: '9:16' as Veo3AspectRatio, label: '9:16', w: 20, h: 36 }
        ]
      : [
          { value: 'auto' as Veo3AspectRatio, label: 'Auto', w: 28, h: 28 },
          { value: '16:9' as Veo3AspectRatio, label: '16:9', w: 36, h: 20 },
          { value: '9:16' as Veo3AspectRatio, label: '9:16', w: 20, h: 36 }
        ]
  );

  $effect(() => {
    if (!aspectOptions.some((o) => o.value === aspectRatio)) {
      aspectRatio = aspectOptions[0].value;
    }
  });

  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap(allVeo3EndpointIds()).then((m) => (priceMap = m));
  });

  const currentEndpointId = $derived(tierMeta.endpoints[task] ?? '');
  const unitPrice = $derived(priceMap[currentEndpointId]?.unit_price ?? null);
  const durationSeconds = $derived(parseInt(duration, 10));

  const apiPath = $derived(`/api/veo3.1/${tier}/${task}`);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }

  function addRef() {
    refImages.push(emptyImage());
  }

  function removeRef(i: number) {
    if (refImages.length > 1) {
      const r = refImages[i];
      if (r.preview) URL.revokeObjectURL(r.preview);
      refImages.splice(i, 1);
    }
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

    if (!prompt.trim()) {
      errorMessage = 'Escribe un prompt.';
      phase = 'error';
      return;
    }

    if (task === 'i2v' && !imageA.file) {
      errorMessage = 'Subí la imagen de entrada.';
      phase = 'error';
      return;
    }
    if (task === 'flf' && (!imageA.file || !imageB.file)) {
      errorMessage = 'Subí imagen inicial y final.';
      phase = 'error';
      return;
    }
    if (task === 'r2v' && !refImages.some((r) => r.file)) {
      errorMessage = 'Subí al menos una imagen de referencia.';
      phase = 'error';
      return;
    }

    reset();

    try {
      if (task === 'i2v') {
        phase = 'uploading';
        if (imageA.file && !imageA.url) imageA.url = await uploadFile(imageA.file);
      } else if (task === 'flf') {
        phase = 'uploading';
        if (imageA.file && !imageA.url) imageA.url = await uploadFile(imageA.file);
        if (imageB.file && !imageB.url) imageB.url = await uploadFile(imageB.file);
      } else if (task === 'r2v') {
        phase = 'uploading';
        for (let i = 0; i < refImages.length; i++) {
          const r = refImages[i];
          if (r.file && !r.url) r.url = await uploadFile(r.file);
        }
      }

      const payload: Record<string, unknown> = {
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        duration,
        resolution,
        generate_audio: generateAudio,
        auto_fix: autoFix,
        safety_tolerance: String(safetyTolerance)
      };
      if (negativePrompt.trim() && task !== 'r2v') payload.negative_prompt = negativePrompt.trim();
      const seedNum = seedRaw.trim() ? Number(seedRaw.trim()) : NaN;
      if (Number.isFinite(seedNum)) payload.seed = seedNum;

      if (task === 'i2v') payload.image_url = imageA.url;
      if (task === 'flf') {
        payload.first_frame_url = imageA.url;
        payload.last_frame_url = imageB.url;
      }
      if (task === 'r2v') {
        payload.image_urls = refImages.filter((r) => r.url).map((r) => r.url);
      }

      phase = 'submitting';
      const subRes = await fetch(`${apiPath}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(`${apiPath}/status?id=${encodeURIComponent(request_id)}`);
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
      if (imageA.preview) URL.revokeObjectURL(imageA.preview);
      if (imageB.preview) URL.revokeObjectURL(imageB.preview);
      refImages.forEach((r) => {
        if (r.preview) URL.revokeObjectURL(r.preview);
      });
    };
  });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Veo 3.1
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
      options={VEO3_TIERS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
      label="Calidad:"
      disabled={isRunning}
    />
  </div>

  <div class="task-row">
    <span class="task-label">¿Cómo armarás la toma?</span>
    <div class="task-options">
      {#each VEO3_TASKS as t}
        {@const supported = veo3TaskSupported(tier, t.value)}
        <button
          type="button"
          class="task-btn"
          class:active={task === t.value && supported}
          onclick={() => supported && (task = t.value)}
          disabled={isRunning || !supported}
          title={supported ? t.hint : `${t.hint} — no disponible en ${tierMeta.label}`}
        >
          <span class="task-name">{t.label}</span>
          <span class="task-hint">{t.hint}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="form-body">
    {#if task === 'i2v'}
      <div class="image-row" transition:slide={{ duration: 200 }}>
        <div class="slot-wrap">
          <ImageSlot bind:state={imageA} disabled={isRunning} placeholder="Imagen de entrada" />
        </div>
      </div>
    {/if}

    {#if task === 'flf'}
      <div class="image-row" transition:slide={{ duration: 200 }}>
        <div class="slot-wrap">
          <ImageSlot bind:state={imageA} disabled={isRunning} placeholder="Primer frame" />
        </div>
        <span class="arrow" aria-hidden="true">→</span>
        <div class="slot-wrap">
          <ImageSlot bind:state={imageB} disabled={isRunning} placeholder="Último frame" />
        </div>
      </div>
    {/if}

    {#if task === 'r2v'}
      <div class="refs" transition:slide={{ duration: 200 }}>
        <span class="field-label">Imágenes de referencia</span>
        <div class="refs-grid">
          {#each refImages as _, i (i)}
            <div class="ref-cell" transition:slide={{ duration: 180 }}>
              <ImageSlot
                bind:state={refImages[i]}
                disabled={isRunning}
                placeholder={`Ref ${i + 1}`}
                minHeight="8rem"
              />
              {#if refImages.length > 1}
                <button
                  type="button"
                  class="ref-remove"
                  aria-label="Quitar referencia"
                  onclick={() => removeRef(i)}
                  disabled={isRunning}
                >×</button>
              {/if}
            </div>
          {/each}
          <button
            type="button"
            class="ref-add"
            onclick={addRef}
            disabled={isRunning}
          >+ Añadir</button>
        </div>
      </div>
    {/if}

    <AspectRatioPicker
      bind:value={aspectRatio}
      options={aspectOptions}
      disabled={isRunning}
    />

    <Prompt
      bind:value={prompt}
      placeholder={task === 't2v'
        ? 'Describe el video que quieres generar...'
        : 'Describe el movimiento / acción / estilo...'}
      rows={6}
      disabled={isRunning}
    />

    <div class="dual-row">
      <Dropdown
        bind:value={duration}
        options={availableDurations.map((d) => ({ value: d, label: d }))}
        label="Duración:"
        disabled={isRunning || availableDurations.length <= 1}
      />
      <Dropdown
        bind:value={resolution}
        options={tierMeta.resolutions.map((r) => ({ value: r, label: r }))}
        label="Resolución:"
        disabled={isRunning}
      />
    </div>

    <Switch
      bind:checked={generateAudio}
      label="🔊 Audio nativo"
      disabled={isRunning}
    />

    <Collapsible bind:open={advancedOpen} title="Avanzado">
      {#if task !== 'r2v'}
        <div class="field">
          <label class="field-label" for="veo3-neg">Prompt negativo</label>
          <Prompt
            bind:value={negativePrompt}
            placeholder="blur, distort, low quality..."
            rows={2}
            small
            disabled={isRunning}
          />
        </div>
      {/if}
      <div class="field">
        <label class="field-label" for="veo3-seed">Seed (opcional)</label>
        <input
          id="veo3-seed"
          type="text"
          class="text-input"
          bind:value={seedRaw}
          placeholder="42"
          disabled={isRunning}
        />
      </div>
      <Switch
        bind:checked={autoFix}
        label="Auto-corregir prompts que fallen el filtro"
        disabled={isRunning}
      />
      <Slider
        bind:value={safetyTolerance}
        min={1}
        max={6}
        step={1}
        label="Tolerancia de seguridad"
        leftHint="estricto"
        rightHint="permisivo"
        disabled={isRunning}
      />
    </Collapsible>

    <CostEstimate {unitPrice} duration={durationSeconds} audio={generateAudio} />

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

  .task-row {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .task-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .task-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  .task-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.7rem 0.5rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast),
      color var(--transition-fast), transform var(--transition-fast);
  }
  .task-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
    transform: translateY(-1px);
  }
  .task-btn.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
    border-color: transparent;
  }
  .task-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .task-name {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: 0.04em;
  }
  .task-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-align: center;
  }
  .task-btn.active .task-hint { color: rgba(255, 255, 255, 0.85); }

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
  .slot-wrap > :global(.image-slot) { flex: 1; }
  .arrow {
    color: var(--text-muted);
    font-size: 1.5rem;
    align-self: center;
  }

  .refs {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .refs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
    gap: 0.6rem;
  }
  .ref-cell {
    position: relative;
    display: flex;
  }
  .ref-cell > :global(.image-slot) { flex: 1; }
  .ref-remove {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    width: 22px;
    height: 22px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border: none;
    border-radius: 50%;
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .ref-add {
    padding: 0.5rem;
    min-height: 8rem;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-card);
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .ref-add:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  .dual-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
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
  .text-input {
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
  .text-input:focus { border-color: var(--accent); }
  .text-input::placeholder {
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
  .submit:disabled { opacity: 0.7; cursor: not-allowed; }
</style>
