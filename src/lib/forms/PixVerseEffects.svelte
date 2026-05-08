<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import Dropdown from '$lib/form/Dropdown.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot, { type ImageSlotState } from '$lib/form/ImageSlot.svelte';
  import ChipGroup from '$lib/form/ChipGroup.svelte';
  import { EFFECTS_VERSIONS, PIXVERSE_EFFECTS, type PixVerseVersion } from '$lib/pixverse-options';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type Resolution = '360p' | '540p' | '720p' | '1080p';

  let version = $state<PixVerseVersion>('v5.5');
  let effectName = $state<string>(PIXVERSE_EFFECTS[0]);
  let image = $state<ImageSlotState>({ file: null, preview: null, url: null });
  let resolution = $state<Resolution>('720p');
  let duration = $state<5 | 8 | 10>(5);
  let negativePrompt = $state('');
  let advancedOpen = $state(false);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let videoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo imagen...', submitting: 'Enviando trabajo...',
    polling: 'Aplicando efecto...', done: '¡Listo!', error: 'Error'
  };

  // v5.5: 5/8/10. v5/v4.5: 5/8.
  const durationOptions = $derived(version === 'v5.5' ? [5, 8, 10] : [5, 8]);
  $effect(() => {
    if (!durationOptions.includes(duration)) duration = 5;
  });

  const endpointPath = $derived(`/api/pixverse/${version}/effects`);
  const currentEndpointModel = $derived(`fal-ai/pixverse/${version}/effects`);

  const ALL_ENDPOINTS = EFFECTS_VERSIONS.map((v) => `fal-ai/pixverse/${v.value}/effects`);
  let priceMap = $state<PriceMap>({});
  $effect(() => { fetchPriceMap(ALL_ENDPOINTS).then((m) => (priceMap = m)); });
  const unitPrice = $derived(priceMap[currentEndpointModel]?.unit_price ?? null);

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
    if (!image.file) { errorMessage = 'Sube una imagen.'; phase = 'error'; return; }
    if (!effectName) { errorMessage = 'Elige un efecto.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (!image.url && image.file) image.url = await uploadFile(image.file);

      const payload: Record<string, unknown> = {
        effect: effectName,
        image_url: image.url,
        resolution,
        duration
      };
      if (negativePrompt.trim()) payload.negative_prompt = negativePrompt.trim();

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
  PixVerse - Effects
</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Aplica un efecto pre-fabricado a tu imagen. Disponible en <strong>v4.5</strong>, <strong>v5</strong> y <strong>v5.5</strong>.
  </p>

  <div class="version-row">
    <Dropdown
      bind:value={version}
      options={EFFECTS_VERSIONS.map((v) => ({ value: v.value, label: v.label, hint: v.hint }))}
      label="Versión:"
      disabled={isRunning}
    />
  </div>

  <ImageSlot bind:state={image} disabled={isRunning} placeholder="Imagen base" minHeight="11rem" />

  <div class="field">
    <label class="field-label" for="effectName">Efecto</label>
    <select id="effectName" bind:value={effectName} class="select select-large" disabled={isRunning}>
      {#each PIXVERSE_EFFECTS as eff}
        <option value={eff}>{eff}</option>
      {/each}
    </select>
  </div>

  <ChipGroup bind:value={resolution} options={resOptions} label="Resolución:" disabled={isRunning} />

  <div class="row">
    <span class="row-label">Duración:</span>
    <div class="chip-group">
      {#each durationOptions as d}
        <button type="button" class="chip-opt" class:active={duration === d}
          onclick={() => (duration = d as 5 | 8 | 10)} disabled={isRunning}>{d}s</button>
      {/each}
    </div>
  </div>

  <Collapsible bind:open={advancedOpen} title="Avanzado">
    <div class="field">
      <label class="field-label" for="neg">Prompt negativo</label>
      <Prompt bind:value={negativePrompt} placeholder="" rows={2} disabled={isRunning} small />
    </div>
  </Collapsible>

  <CostEstimate {unitPrice} {duration} />

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Generar'}</button>

  <StatusPanel {phase} phaseLabel={phaseLabel[phase]} {errorMessage} {logs} resultUrl={videoUrl} />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }
  .intro { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.55; }
  .intro strong { color: var(--text-primary); }
  .version-row { display: flex; justify-content: flex-start; }

  .row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .row-label { color: var(--text-secondary); font-size: 0.95rem; }
  .chip-group { display: flex; gap: 0.4rem; padding: 0.3rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill); }
  .chip-opt {
    padding: 0.4rem 0.95rem; background: transparent; border: none; border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.88rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .chip-opt:hover:not(:disabled) { color: var(--text-primary); }
  .chip-opt.active { background: var(--accent); color: #fff; box-shadow: var(--accent-shadow); }
  .chip-opt:disabled { opacity: 0.5; cursor: not-allowed; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label { color: var(--text-secondary); font-size: 0.9rem; }
  .select {
    background: rgba(255,255,255,0.04); border: var(--border-subtle); border-radius: 8px;
    padding: 0.5rem 0.85rem; color: var(--text-primary); font-family: var(--font-sans);
    font-size: 0.9rem; outline: none;
    transition: border-color var(--transition-fast);
  }
  .select-large { font-size: 1rem; padding: 0.65rem 0.85rem; }
  .select:focus { border-color: var(--accent); }

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
