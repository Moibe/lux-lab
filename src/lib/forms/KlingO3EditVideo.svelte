<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Collapsible from '$lib/form/Collapsible.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import RichElementsList from '$lib/form/RichElementsList.svelte';
  import type { RichElement } from '$lib/form/RichElementsList.svelte';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type VideoSlot = { file: File | null; preview: string | null; url: string | null };

  let { endpointPath, title, backHref, backLabel }: {
    endpointPath: string;
    title: string;
    backHref: string;
    backLabel: string;
  } = $props();

  function emptyImage(): ImgState { return { file: null, preview: null, url: null }; }
  function emptyVideo(): VideoSlot { return { file: null, preview: null, url: null }; }

  let video = $state<VideoSlot>(emptyVideo());
  let prompt = $state('');
  let imageRefs = $state<ImgState[]>([]);
  let elements = $state<RichElement[]>([]);
  let imagesOpen = $state(false);
  let elementsOpen = $state(false);
  let lastFocused = $state<HTMLTextAreaElement | null>(null);

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let resultVideoUrl = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(phase === 'uploading' || phase === 'submitting' || phase === 'polling');
  const phaseLabel: Record<Phase, string> = {
    idle: '', uploading: 'Subiendo media...', submitting: 'Enviando trabajo...',
    polling: 'Editando video...', done: '¡Listo!', error: 'Error'
  };

  const EDIT_ENDPOINT = 'fal-ai/kling-video/o3/pro/video-to-video/edit';
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    fetchPriceMap([EDIT_ENDPOINT]).then((m) => (priceMap = m));
  });
  const unitPrice = $derived(priceMap[EDIT_ENDPOINT]?.unit_price ?? null);

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url;
  }

  function setVideo(file: File): VideoSlot {
    if (video.preview) URL.revokeObjectURL(video.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }
  function setImageInSlot(slot: ImgState, file: File): ImgState {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    return { file, preview: URL.createObjectURL(file), url: null };
  }

  function addImageRef() { imageRefs.push(emptyImage()); }
  function removeImageRef(i: number) {
    if (imageRefs[i].preview) URL.revokeObjectURL(imageRefs[i].preview!);
    imageRefs.splice(i, 1);
  }

  function insertChip(text: string) {
    const ta = lastFocused; if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + text.length, start + text.length); });
  }

  function reset() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logs = []; resultVideoUrl = null; errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!video.file) { errorMessage = 'Sube el video que quieres editar.'; phase = 'error'; return; }
    if (!prompt.trim()) { errorMessage = 'Escribe la instrucción de edición.'; phase = 'error'; return; }
    if (imageRefs.some((r) => !r.file)) { errorMessage = 'Cada imagen referenciada necesita archivo.'; phase = 'error'; return; }
    if (elements.some((el) => !el.frontal.file)) { errorMessage = 'Cada elemento necesita imagen frontal.'; phase = 'error'; return; }
    reset();
    try {
      phase = 'uploading';
      if (!video.url) video.url = await uploadFile(video.file);
      for (let i = 0; i < imageRefs.length; i++) {
        if (!imageRefs[i].url && imageRefs[i].file) imageRefs[i].url = await uploadFile(imageRefs[i].file!);
      }
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el.frontal.url && el.frontal.file) el.frontal.url = await uploadFile(el.frontal.file);
        for (let j = 0; j < el.refs.length; j++) {
          if (!el.refs[j].url && el.refs[j].file) el.refs[j].url = await uploadFile(el.refs[j].file!);
        }
      }

      const payload: Record<string, unknown> = {
        video_url: video.url,
        prompt: prompt.trim()
      };
      if (imageRefs.length > 0) payload.image_urls = imageRefs.map((r) => r.url!);
      if (elements.length > 0) {
        payload.elements = elements.map((el) => ({
          frontal_image_url: el.frontal.url!,
          ...(el.refs.length > 0 ? { reference_image_urls: el.refs.map((r) => r.url!) } : {}),
          ...(el.voiceId.trim() ? { voice_id: el.voiceId.trim() } : {})
        }));
      }

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
        if (data.status === 'COMPLETED') { resultVideoUrl = data.result?.video?.url ?? null; phase = 'done'; return; }
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
    if (video.preview) URL.revokeObjectURL(video.preview);
    imageRefs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
    elements.forEach((el) => {
      if (el.frontal.preview) URL.revokeObjectURL(el.frontal.preview);
      el.refs.forEach((r) => { if (r.preview) URL.revokeObjectURL(r.preview); });
    });
  });
</script>

<BackButton href={backHref} label={backLabel} />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>{title}</h1>

<form class="form" onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <label class="video-slot" class:filled={!!video.preview}>
    <input type="file" accept="video/*" disabled={isRunning} onchange={(e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) video = setVideo(f);
    }} />
    {#if video.preview}
      <video src={video.preview} class="video-preview" muted></video>
      <button type="button" class="clear" aria-label="Quitar video" onclick={(e) => {
        e.preventDefault();
        if (video.preview) URL.revokeObjectURL(video.preview);
        video = emptyVideo();
      }}>×</button>
    {:else}
      <span class="placeholder"><span class="big">+</span><span class="hint">Video a editar<br /><small>(mp4, mov, webm, m4v, gif)</small></span></span>
    {/if}
  </label>

  {#if (imageRefs.length > 0 && imageRefs.some((r) => r.url || r.file)) || elements.length > 0}
    <div class="chips" transition:slide={{ duration: 200 }}>
      <span class="chips-label">Insertar:</span>
      {#each imageRefs as r, i}
        {#if r.file || r.url}<button type="button" class="chip" onclick={() => insertChip(`@Image${i + 1}`)} disabled={isRunning}>@Image{i + 1}</button>{/if}
      {/each}
      {#each elements as _, i}
        <button type="button" class="chip element-chip" onclick={() => insertChip(`@Element${i + 1}`)} disabled={isRunning}>@Element{i + 1}</button>
      {/each}
    </div>
  {/if}

  <Prompt
    bind:value={prompt}
    placeholder="Instrucción de edición. Usa @Image1, @Element1..."
    rows={5}
    small
    disabled={isRunning}
    onfocusEvent={(e) => (lastFocused = e.currentTarget)}
  />

  <Collapsible bind:open={imagesOpen} title="Imágenes referenciadas (@Image)" icon="🖼️">
    <p class="help">Sube imágenes y referéncialas como <code>@Image1</code>, <code>@Image2</code>, etc. (1-indexado, máx 10).</p>
    <div class="grid">
      {#each imageRefs as r, i (i)}
        <div class="ref-card" transition:slide={{ duration: 200 }}>
          <span class="ref-tag">@Image{i + 1}</span>
          <label class="image-square" class:filled={!!r.preview}>
            <input type="file" accept="image/*" disabled={isRunning} onchange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) imageRefs[i] = setImageInSlot(r, f);
            }} />
            {#if r.preview}<img src={r.preview} alt={`image ${i + 1}`} />{:else}<span class="big">+</span>{/if}
          </label>
          <button type="button" class="ref-remove" aria-label="Quitar imagen" onclick={() => removeImageRef(i)} disabled={isRunning}>×</button>
        </div>
      {/each}
      <button type="button" class="add-card" onclick={addImageRef} disabled={isRunning || imageRefs.length >= 10}>+ Imagen</button>
    </div>
  </Collapsible>

  <Collapsible bind:open={elementsOpen} title="Elementos referenciados (@Element)" icon="🧩">
    <p class="help">
      Cada elemento tiene una <strong>imagen frontal</strong> + opcionalmente más <strong>imágenes de referencia</strong> de estilo. Posicional: <code>@Element1</code> es el primero, <code>@Element2</code> el segundo, etc.
    </p>
    <RichElementsList bind:elements disabled={isRunning} voiceIdMode="enabled" />
  </Collapsible>

  {#if unitPrice !== null}
    <CostEstimate {unitPrice} flat />
  {/if}

  <button class="submit" type="submit" disabled={isRunning}>{isRunning ? phaseLabel[phase] : 'Editar video'}</button>

  <StatusPanel
    {phase}
    phaseLabel={phaseLabel[phase]}
    {errorMessage}
    {logs}
    resultUrl={resultVideoUrl}
  />
</form>

<style>
  .page-title { text-align: center; max-width: min(1100px, 92vw); line-height: 1.1; }
  .form { margin-top: 2rem; width: min(700px, 92vw); display: flex; flex-direction: column; gap: 1.25rem; }

  .video-slot {
    position: relative; display: flex; align-items: center; justify-content: center;
    min-height: 12rem; background: #fff; border: 1.5px dashed #000; border-radius: var(--radius-card);
    color: #000; cursor: pointer; box-shadow: var(--shadow-card); overflow: hidden;
    transition: border-style var(--transition-fast);
  }
  .video-slot:hover { border-style: solid; }
  .video-slot.filled { border-style: solid; padding: 0; }
  .video-slot input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .video-preview { width: 100%; max-height: 18rem; object-fit: cover; }
  .placeholder { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 1rem; text-align: center; }
  .placeholder .big { font-size: 1.75rem; font-weight: 300; color: rgba(0, 0, 0, 0.55); }
  .placeholder .hint { font-size: 0.85rem; color: rgba(0, 0, 0, 0.55); line-height: 1.2; }
  .placeholder .hint small { font-size: 0.75rem; color: rgba(0, 0, 0, 0.45); }
  .clear {
    position: absolute; top: 0.4rem; right: 0.4rem; width: 24px; height: 24px;
    background: rgba(0, 0, 0, 0.7); color: #fff; border: none; border-radius: 50%;
    font-size: 1rem; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .clear:hover { background: rgba(0, 0, 0, 0.9); }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chips-label { color: var(--text-muted); font-size: 0.85rem; margin-right: 0.25rem; }
  .chip {
    padding: 0.3rem 0.7rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-pill);
    color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.85rem; font-weight: 500; cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .chip:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-1px); box-shadow: var(--accent-shadow); }
  .chip.element-chip { border-color: rgba(168, 85, 247, 0.3); }

  .help { margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5; }
  .help code { padding: 0.1rem 0.4rem; background: var(--surface-pill); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; }
  .ref-card { position: relative; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; background: var(--surface-pill); border: var(--border-subtle); border-radius: var(--radius-card); }
  .ref-tag { display: inline-block; padding: 0.15rem 0.5rem; background: rgba(37,99,235,0.2); border: 1px solid rgba(37,99,235,0.4); border-radius: 6px; color: var(--text-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; align-self: flex-start; }
  .image-square {
    position: relative; aspect-ratio: 1; background: #fff;
    border: 1.5px dashed #000; border-radius: 8px; overflow: hidden; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .image-square.filled { border-style: solid; }
  .image-square input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .image-square img { width: 100%; height: 100%; object-fit: cover; }
  .image-square .big { font-size: 1.5rem; color: rgba(0, 0, 0, 0.55); font-weight: 300; }
  .ref-remove {
    position: absolute; top: 0.3rem; right: 0.3rem; width: 22px; height: 22px;
    background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%;
    font-size: 0.9rem; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .ref-remove:hover:not(:disabled) { background: rgba(0,0,0,0.85); }
  .add-card {
    display: flex; align-items: center; justify-content: center; min-height: 120px;
    padding: 0.65rem; background: transparent; border: 1px dashed rgba(255,255,255,0.2);
    border-radius: var(--radius-card); color: var(--text-muted); font-family: var(--font-sans); font-size: 0.9rem; cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .add-card:hover:not(:disabled) { border-color: var(--accent); color: var(--text-primary); }
  .add-card:disabled { opacity: 0.4; cursor: not-allowed; }

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
