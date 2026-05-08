<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import Slider from '$lib/form/Slider.svelte';
  import CostEstimate from '$lib/form/CostEstimate.svelte';
  import Prompt from '$lib/form/Prompt.svelte';
  import ImageSlot from '$lib/form/ImageSlot.svelte';
  import AspectRatioPicker from '$lib/form/AspectRatioPicker.svelte';
  import { KNOWN_ENDPOINTS, type KnownEndpoint } from '$lib/known-endpoints';
  import { fetchPriceMap, formatCost, type PriceMap } from '$lib/cost';
  import { WAN_MODELS } from '$lib/wan-options';
  import { SEEDANCE_TIERS } from '$lib/seedance-options';

  type Mode = 'i2v' | 't2v';
  type AspectRatio = '16:9' | '9:16' | '1:1';
  type ImgState = { file: File | null; preview: string | null; url: string | null };
  type Phase = 'idle' | 'queued' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';

  type RunCard = {
    endpointId: string;
    provider: KnownEndpoint['provider'];
    model: string;
    variant: string;
    task: 'I2V' | 'T2V';
    phase: Phase;
    logs: string[];
    videoUrl: string | null;
    errorMessage: string | null;
    requestId: string | null;
    pollTimer: ReturnType<typeof setTimeout> | null;
    unitPrice: number | null;
    duration: number;
  };

  function emptyImage(): ImgState {
    return { file: null, preview: null, url: null };
  }

  // ---------------- API path resolution ----------------
  // Map a KnownEndpoint id (the fal model slug) to studio's local API path.
  // Returns null when no studio wrapper exists for that endpoint (so Lab excludes it).
  type Resolved = {
    apiPath: string;          // e.g. "/api/kling/v3/image-to-video-pro"
    extraBody?: Record<string, unknown>; // body fields the studio wrapper requires (e.g. {tier})
  };

  function resolveApiPath(ep: KnownEndpoint): Resolved | null {
    const id = ep.id;

    // Kling v3 (only has tiers 4k/pro/standard, both i2v + t2v)
    let m = id.match(/^fal-ai\/kling-video\/v3\/(4k|pro|standard)\/(image-to-video|text-to-video)$/);
    if (m) {
      const tier = m[1];
      const task = m[2] === 'image-to-video' ? 'image-to-video' : 'text-to-video';
      return { apiPath: `/api/kling/v3/${task}-${tier}` };
    }

    // Kling o3 (only i2v + t2v supported in Lab)
    m = id.match(/^fal-ai\/kling-video\/o3\/(4k|pro|standard)\/(image-to-video|text-to-video)$/);
    if (m) {
      const tier = m[1];
      const task = m[2] === 'image-to-video' ? 'image-to-video' : 'text-to-video';
      return { apiPath: `/api/kling/o3/${task}-${tier}` };
    }

    // Happy Horse i2v / t2v
    if (id === 'alibaba/happy-horse/image-to-video') return { apiPath: '/api/happy-horse/image-to-video' };
    if (id === 'alibaba/happy-horse/text-to-video') return { apiPath: '/api/happy-horse/text-to-video' };

    // Seedance i2v / t2v — wrapper switches by `tier` body field. Match against SEEDANCE_TIERS.
    for (const t of SEEDANCE_TIERS) {
      if (t.endpoints.i2v === id) return { apiPath: '/api/seedance/image-to-video', extraBody: { tier: t.value } };
      if (t.endpoints.t2v === id) return { apiPath: '/api/seedance/text-to-video', extraBody: { tier: t.value } };
    }

    // Wan (dynamic [model] route — uses slug, not the modelId string).
    for (const w of WAN_MODELS) {
      if (w.i2vModelId === id) return { apiPath: `/api/wan/${w.slug}/image-to-video` };
      if (w.t2vModelId === id) return { apiPath: `/api/wan/${w.slug}/text-to-video` };
    }

    // PixVerse — only versions with studio wrappers (v6, c1, v5.6, v5.5, v5, v4.5).
    m = id.match(/^fal-ai\/pixverse\/(v6|c1|v5\.6|v5\.5|v5|v4\.5)\/(image-to-video|text-to-video)$/);
    if (m) {
      const ver = m[1];
      const task = m[2];
      return { apiPath: `/api/pixverse/${ver}/${task}` };
    }
    // pixverse v4.5 has no t2v — already filtered by the regex above.

    // Veo 3.1 — Standard / Fast / Lite × T2V / I2V (R2V y FLF requieren inputs extras, fuera del Lab).
    m = id.match(/^fal-ai\/veo3\.1(?:\/(fast|lite))?(?:\/(image-to-video))?$/);
    if (m) {
      const tier = m[1] ?? 'standard';
      const task = m[2] === 'image-to-video' ? 'i2v' : 't2v';
      return { apiPath: `/api/veo3.1/${tier}/${task}` };
    }

    // Hailuo-02 — Standard / Pro × i2v / t2v.
    m = id.match(/^fal-ai\/minimax\/hailuo-02\/(standard|pro)\/(image-to-video|text-to-video)$/);
    if (m) {
      const tier = m[1];
      const task = m[2] === 'image-to-video' ? 'i2v' : 't2v';
      return { apiPath: `/api/hailuo-02/${tier}/${task}` };
    }

    // LTX-2.3 — Standard / Fast × t2v / i2v (audio-to-video / extend / retake fuera del Lab).
    m = id.match(/^fal-ai\/ltx-2\.3\/(text|image)-to-video(\/fast)?$/);
    if (m) {
      const task = m[1] === 'text' ? 't2v' : 'i2v';
      const tier = m[2] ? 'fast' : 'standard';
      return { apiPath: `/api/ltx-2.3/${tier}/${task}` };
    }

    return null;
  }

  // Build the per-endpoint payload from the shared LCD inputs.
  // Each provider has a slightly different payload shape. We send the LCD only,
  // omitting fields that aren't accepted (the wrapper is strict for some providers).
  function buildPayload(
    ep: KnownEndpoint,
    base: { prompt: string; imageUrl: string | null; aspectRatio: AspectRatio; duration: number },
    extra: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    const isI2V = ep.task === 'I2V';
    const payload: Record<string, unknown> = { ...(extra ?? {}) };

    if (ep.provider === 'Kling') {
      // Kling v3/o3 payload: prompt, duration (number), image_url for i2v, aspect_ratio for t2v.
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
      } else {
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'Happy Horse') {
      // Happy Horse: prompt + duration + image_url (i2v) or aspect_ratio (t2v).
      // resolution is required-ish in form, server defaults it; omit to use server default.
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
        if (base.prompt.trim()) payload.prompt = base.prompt;
      } else {
        payload.prompt = base.prompt;
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'Seedance') {
      // Seedance wrapper accepts duration as number/string, prompt, image_url/aspect_ratio.
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
        if (base.prompt.trim()) payload.prompt = base.prompt;
      } else {
        payload.prompt = base.prompt;
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'Wan') {
      // Wan wrapper: prompt always required, image_url for i2v.
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
      } else {
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'PixVerse') {
      // PixVerse wrappers require prompt + image_url for I2V and prompt for T2V.
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
      } else {
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'Veo') {
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
      } else {
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    if (ep.provider === 'Hailuo') {
      // Hailuo-02 no toma aspect_ratio — el formato lo deduce de la imagen / prompt.
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) payload.image_url = base.imageUrl;
      return payload;
    }

    if (ep.provider === 'LTX') {
      payload.prompt = base.prompt;
      payload.duration = base.duration;
      if (isI2V) {
        payload.image_url = base.imageUrl;
      } else {
        payload.aspect_ratio = base.aspectRatio;
      }
      return payload;
    }

    return payload;
  }

  // ---------------- State ----------------
  let mode = $state<Mode>('t2v');
  let prompt = $state('');
  let aspectRatio = $state<AspectRatio>('16:9');
  let duration = $state(5);
  let image = $state<ImgState>(emptyImage());

  let selectedIds = $state<Set<string>>(new Set());

  let cards = $state<RunCard[]>([]);
  let isRunning = $state(false);

  // ---------------- Derived: candidate endpoints ----------------
  // Filter to I2V or T2V (LCD-compatible) AND only those with a studio API wrapper.
  const candidates = $derived(
    KNOWN_ENDPOINTS.filter((ep) => {
      if (mode === 'i2v' && ep.task !== 'I2V') return false;
      if (mode === 't2v' && ep.task !== 'T2V') return false;
      return resolveApiPath(ep) !== null;
    })
  );

  // Group candidates by provider for the multi-selector UI.
  const groupedCandidates = $derived.by(() => {
    const groups = new Map<KnownEndpoint['provider'], KnownEndpoint[]>();
    for (const ep of candidates) {
      if (!groups.has(ep.provider)) groups.set(ep.provider, []);
      groups.get(ep.provider)!.push(ep);
    }
    return [...groups.entries()];
  });

  // ---------------- Pricing ----------------
  let priceMap = $state<PriceMap>({});
  $effect(() => {
    const ids = candidates.map((e) => e.id);
    if (ids.length === 0) return;
    fetchPriceMap(ids).then((m) => (priceMap = m));
  });

  const selectedEndpoints = $derived(candidates.filter((ep) => selectedIds.has(ep.id)));
  const totalEstimatedCost = $derived(
    selectedEndpoints.reduce((sum, ep) => {
      const p = priceMap[ep.id]?.unit_price ?? null;
      if (p === null) return sum;
      return sum + p * duration;
    }, 0)
  );
  const costThreshold = 5; // USD — highlight if estimate > this

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleProvider(provider: KnownEndpoint['provider']) {
    const provIds = candidates.filter((e) => e.provider === provider).map((e) => e.id);
    const allSelected = provIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      provIds.forEach((id) => next.delete(id));
    } else {
      provIds.forEach((id) => next.add(id));
    }
    selectedIds = next;
  }

  function clearAll() {
    selectedIds = new Set();
  }

  // ---------------- Submit & dispatch ----------------
  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Upload falló: ${await res.text()}`);
    const { url } = await res.json();
    return url as string;
  }

  function updateCard(idx: number, patch: Partial<RunCard>) {
    cards[idx] = { ...cards[idx], ...patch };
  }

  async function dispatchOne(
    idx: number,
    ep: KnownEndpoint,
    base: { prompt: string; imageUrl: string | null; aspectRatio: AspectRatio; duration: number }
  ) {
    const resolved = resolveApiPath(ep);
    if (!resolved) {
      updateCard(idx, { phase: 'error', errorMessage: 'No hay wrapper de API para este endpoint.' });
      return;
    }
    try {
      updateCard(idx, { phase: 'submitting' });
      const payload = buildPayload(ep, base, resolved.extraBody);
      const subRes = await fetch(`${resolved.apiPath}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!subRes.ok) throw new Error(`Submit ${subRes.status}: ${await subRes.text()}`);
      const { request_id } = await subRes.json();
      updateCard(idx, { phase: 'polling', requestId: request_id });

      const poll = async () => {
        try {
          const r = await fetch(`${resolved.apiPath}/status?id=${encodeURIComponent(request_id)}`);
          if (!r.ok) throw new Error(`Status ${r.status}: ${await r.text()}`);
          const data = await r.json();
          if (Array.isArray(data.logs) && data.logs.length) {
            updateCard(idx, {
              logs: data.logs.map((l: { message?: string }) => l.message ?? '')
            });
          }
          if (data.status === 'COMPLETED') {
            updateCard(idx, {
              phase: 'done',
              videoUrl: data.result?.video?.url ?? null,
              pollTimer: null
            });
            return;
          }
          const t = setTimeout(poll, 3500);
          updateCard(idx, { pollTimer: t });
        } catch (err) {
          updateCard(idx, {
            phase: 'error',
            errorMessage: err instanceof Error ? err.message : 'Error desconocido',
            pollTimer: null
          });
        }
      };
      poll();
    } catch (err) {
      updateCard(idx, {
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Error desconocido'
      });
    }
  }

  function cleanupTimers() {
    for (const c of cards) {
      if (c.pollTimer) clearTimeout(c.pollTimer);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (isRunning) return;
    if (selectedEndpoints.length === 0) return;
    if (!prompt.trim() && mode === 't2v') return;
    if (mode === 'i2v' && !image.file) return;

    cleanupTimers();

    // Initialize cards.
    cards = selectedEndpoints.map((ep) => ({
      endpointId: ep.id,
      provider: ep.provider,
      model: ep.model,
      variant: ep.variant,
      task: ep.task as 'I2V' | 'T2V',
      phase: 'queued' as Phase,
      logs: [],
      videoUrl: null,
      errorMessage: null,
      requestId: null,
      pollTimer: null,
      unitPrice: priceMap[ep.id]?.unit_price ?? null,
      duration
    }));
    isRunning = true;

    try {
      // Upload image once if needed; share URL across all endpoints.
      let imageUrl: string | null = null;
      if (mode === 'i2v' && image.file) {
        for (let i = 0; i < cards.length; i++) updateCard(i, { phase: 'uploading' });
        try {
          imageUrl = image.url ?? (await uploadFile(image.file));
          image.url = imageUrl;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error subiendo imagen';
          for (let i = 0; i < cards.length; i++) {
            updateCard(i, { phase: 'error', errorMessage: msg });
          }
          return;
        }
      }

      const base = {
        prompt: prompt.trim(),
        imageUrl,
        aspectRatio,
        duration
      };

      // Fire all dispatches in parallel; each card progresses independently.
      const tasks = selectedEndpoints.map((ep, idx) => dispatchOne(idx, ep, base));
      // We don't await — they each manage their own polling loops.
      // But we want isRunning to flip back to false when no card is in-flight.
      Promise.allSettled(tasks); // dispatch (submit) phase tracking
    } finally {
      // isRunning controls "form locked"; we relax it after all submits placed.
      // The polling loops continue in the background.
      // Wait a microtask so submitting -> polling transitions render before unlocking.
      queueMicrotask(() => {
        isRunning = false;
      });
    }
  }

  // Cleanup on unmount.
  $effect(() => {
    return () => {
      cleanupTimers();
      if (image.preview) URL.revokeObjectURL(image.preview);
    };
  });

  // ---------------- UI helpers ----------------
  const phaseLabels: Record<Phase, string> = {
    idle: 'Listo',
    queued: 'En cola...',
    uploading: 'Subiendo imagen...',
    submitting: 'Enviando...',
    polling: 'Generando...',
    done: '¡Listo!',
    error: 'Error'
  };

  const aspectOptions: { value: AspectRatio; label: string; w: number; h: number }[] = [
    { value: '16:9', label: '16:9', w: 36, h: 20 },
    { value: '9:16', label: '9:16', w: 20, h: 36 },
    { value: '1:1', label: '1:1', w: 28, h: 28 }
  ];

  function unitPriceFor(id: string): number | null {
    return priceMap[id]?.unit_price ?? null;
  }
  function actualCostFor(card: RunCard): number | null {
    if (card.unitPrice === null) return null;
    return card.unitPrice * card.duration;
  }

  // When mode changes, reset image and selection (selection may include incompatible task).
  $effect(() => {
    void mode;
    selectedIds = new Set();
  });
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Lab — comparativa cross-provider
</h1>

<section
  class="content"
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Lanza el <strong>mismo input</strong> a varios endpoints en paralelo y compara los resultados lado a lado.
    Lab usa un denominador común (prompt, imagen, aspect ratio, duración) — para opciones avanzadas de cada
    proveedor usá su página dedicada.
  </p>

  <form class="form" onsubmit={handleSubmit}>
    <!-- Mode toggle -->
    <div class="row mode-row">
      <span class="row-label">Modo:</span>
      <div class="mode-options">
        <button
          type="button"
          class="mode-btn"
          class:active={mode === 'i2v'}
          onclick={() => (mode = 'i2v')}
          disabled={isRunning}
        >
          <span class="mode-icon">🖼️</span>
          <span>Image-to-Video</span>
        </button>
        <button
          type="button"
          class="mode-btn"
          class:active={mode === 't2v'}
          onclick={() => (mode = 't2v')}
          disabled={isRunning}
        >
          <span class="mode-icon">✍️</span>
          <span>Text-to-Video</span>
        </button>
      </div>
    </div>

    {#if mode === 'i2v'}
      <div transition:slide={{ duration: 200 }}>
        <ImageSlot
          bind:state={image}
          disabled={isRunning}
          placeholder="Imagen base"
          placeholderHint="(JPEG/PNG/WEBP)"
          minHeight="11rem"
        />
      </div>
    {:else}
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
      placeholder={mode === 'i2v' ? 'Prompt (opcional para algunos endpoints)' : 'Describe el video...'}
      rows={4}
      disabled={isRunning}
    />

    <Slider bind:value={duration} min={3} max={15} label="Duración" suffix="s" disabled={isRunning} />

    <!-- Endpoint multi-selector -->
    <div class="endpoints-section">
      <div class="endpoints-head">
        <span class="row-label">Endpoints a comparar ({selectedEndpoints.length} seleccionados):</span>
        {#if selectedEndpoints.length > 0}
          <button type="button" class="clear-btn" onclick={clearAll} disabled={isRunning}>
            Limpiar
          </button>
        {/if}
      </div>

      <div class="provider-groups">
        {#each groupedCandidates as [provider, eps] (provider)}
          {@const allOn = eps.every((e) => selectedIds.has(e.id))}
          <div class="provider-group">
            <button
              type="button"
              class="provider-head"
              class:all-on={allOn}
              data-provider={provider}
              onclick={() => toggleProvider(provider)}
              disabled={isRunning}
            >
              <span class="provider-tag" data-provider={provider}>{provider}</span>
              <span class="provider-count">
                {eps.filter((e) => selectedIds.has(e.id)).length}/{eps.length}
              </span>
            </button>
            <div class="endpoint-cards">
              {#each eps as ep (ep.id)}
                {@const sel = selectedIds.has(ep.id)}
                {@const price = unitPriceFor(ep.id)}
                <button
                  type="button"
                  class="endpoint-card"
                  class:selected={sel}
                  onclick={() => toggleSelect(ep.id)}
                  disabled={isRunning}
                >
                  <div class="endpoint-card-head">
                    <span class="endpoint-name">{ep.model} <span class="variant">{ep.variant}</span></span>
                    <span class="endpoint-check" class:on={sel}>{sel ? '✓' : ''}</span>
                  </div>
                  <div class="endpoint-card-body">
                    <span class="task-tag">{ep.task}</span>
                    <span class="endpoint-price">
                      {price !== null ? `$${price.toFixed(3)}/s` : '—'}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      {#if candidates.length === 0}
        <p class="empty-msg">No hay endpoints disponibles para este modo.</p>
      {/if}
    </div>

    <!-- Cost preview: total + per-endpoint breakdown -->
    {#if selectedEndpoints.length > 0}
      <div class="cost-preview" class:warn={totalEstimatedCost > costThreshold} transition:fade={{ duration: 150 }}>
        <div class="total-row">
          <span class="total-label">Costo total estimado:</span>
          <strong class="total-value">{formatCost(totalEstimatedCost)}</strong>
          <small class="total-hint">
            {selectedEndpoints.length} endpoint{selectedEndpoints.length > 1 ? 's' : ''} × {duration}s
            {#if totalEstimatedCost > costThreshold}<span class="warn-badge">⚠️ alto</span>{/if}
          </small>
        </div>

        <ul class="breakdown" transition:slide={{ duration: 200 }}>
          {#each selectedEndpoints as ep (ep.id)}
            {@const price = unitPriceFor(ep.id)}
            {@const subtotal = price !== null ? price * duration : null}
            <li class="breakdown-row">
              <span class="breakdown-tag" data-provider={ep.provider}>{ep.provider}</span>
              <span class="breakdown-name">
                {ep.model}
                {#if ep.variant !== '-'}<span class="breakdown-variant">{ep.variant}</span>{/if}
                <span class="breakdown-task">{ep.task}</span>
              </span>
              <span class="breakdown-calc">
                {#if price !== null}
                  ${price.toFixed(3)}/s × {duration}s
                {:else}
                  precio no disponible
                {/if}
              </span>
              <strong class="breakdown-subtotal">
                {subtotal !== null ? formatCost(subtotal) : '—'}
              </strong>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <button
      class="submit"
      type="submit"
      disabled={isRunning ||
        selectedEndpoints.length === 0 ||
        (mode === 't2v' && !prompt.trim()) ||
        (mode === 'i2v' && !image.file)}
    >
      {#if isRunning}
        Lanzando...
      {:else if selectedEndpoints.length === 0}
        Seleccioná al menos un endpoint
      {:else}
        Generar en {selectedEndpoints.length} endpoint{selectedEndpoints.length > 1 ? 's' : ''}
      {/if}
    </button>
  </form>

  <!-- Results grid -->
  {#if cards.length > 0}
    <div class="results-grid" transition:fade={{ duration: 200 }}>
      {#each cards as card (card.endpointId)}
        <div class="result-card" data-phase={card.phase}>
          <div class="result-head">
            <span class="provider-tag" data-provider={card.provider}>{card.provider}</span>
            <span class="result-model">{card.model} <span class="variant">{card.variant}</span></span>
            <span class="task-tag">{card.task}</span>
          </div>
          <div class="result-status">
            <span
              class="phase-tag"
              class:done-tag={card.phase === 'done'}
              class:error-tag={card.phase === 'error'}
            >
              {phaseLabels[card.phase]}
            </span>
            {#if actualCostFor(card) !== null}
              <span class="card-cost">{formatCost(actualCostFor(card)!)}</span>
            {/if}
          </div>
          {#if card.errorMessage}
            <p class="error-msg">{card.errorMessage}</p>
          {/if}
          {#if card.logs.length > 0 && card.phase !== 'done' && card.phase !== 'error'}
            <ul class="logs">
              {#each card.logs.slice(-3) as line}
                <li>{line}</li>
              {/each}
            </ul>
          {/if}
          {#if card.videoUrl}
            <video class="result-video" src={card.videoUrl} controls loop></video>
            <a class="download" href={card.videoUrl} download>Descargar</a>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-title {
    text-align: center;
    max-width: min(1100px, 92vw);
    line-height: 1.1;
  }
  .content {
    margin-top: 2rem;
    width: min(1100px, 95vw);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .intro {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.55;
  }
  .intro strong {
    color: var(--text-secondary);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .row-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .mode-options {
    display: flex;
    gap: 0.5rem;
  }
  .mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 1rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast),
      transform var(--transition-fast);
  }
  .mode-btn:hover:not(:disabled) {
    color: var(--text-primary);
    transform: translateY(-1px);
  }
  .mode-btn.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
  }
  .mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .mode-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .endpoints-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .endpoints-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  .clear-btn {
    padding: 0.3rem 0.75rem;
    background: transparent;
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 0.8rem;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .clear-btn:hover:not(:disabled) {
    color: #fca5a5;
    border-color: #fca5a5;
  }

  .provider-groups {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .provider-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
  }
  .provider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-pill);
    cursor: pointer;
    color: var(--text-secondary);
    transition: background var(--transition-fast);
  }
  .provider-head:hover:not(:disabled) {
    background: var(--hover-bg);
  }
  .provider-head:disabled {
    cursor: not-allowed;
  }
  .provider-count {
    color: var(--text-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .endpoint-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.5rem;
  }
  .endpoint-card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast),
      transform var(--transition-fast);
  }
  .endpoint-card:hover:not(:disabled) {
    background: var(--hover-bg);
    border-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
  }
  .endpoint-card.selected {
    background: rgba(37, 99, 235, 0.18);
    border-color: var(--accent);
    color: var(--text-primary);
  }
  .endpoint-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .endpoint-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .endpoint-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9rem;
  }
  .variant {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.8rem;
  }
  .endpoint-check {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: #fff;
    flex-shrink: 0;
  }
  .endpoint-check.on {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: var(--accent-shadow);
  }
  .endpoint-card-body {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }
  .endpoint-price {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
  }

  .empty-msg {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    text-align: center;
    padding: 1rem;
  }

  .provider-tag {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .provider-tag[data-provider='Kling'] { background: rgba(37, 99, 235, 0.2); border: 1px solid rgba(37, 99, 235, 0.35); }
  .provider-tag[data-provider='Seedance'] { background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.35); }
  .provider-tag[data-provider='Wan'] { background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.35); }
  .provider-tag[data-provider='PixVerse'] { background: rgba(249, 115, 22, 0.2); border: 1px solid rgba(249, 115, 22, 0.35); }
  .provider-tag[data-provider='Happy Horse'] { background: rgba(236, 72, 153, 0.2); border: 1px solid rgba(236, 72, 153, 0.35); }
  .provider-tag[data-provider='Veo'] { background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); }
  .provider-tag[data-provider='Hailuo'] { background: rgba(6, 182, 212, 0.2); border: 1px solid rgba(6, 182, 212, 0.4); }
  .provider-tag[data-provider='LTX'] { background: rgba(132, 204, 22, 0.2); border: 1px solid rgba(132, 204, 22, 0.4); }
  .provider-tag[data-provider='Omnihuman'] { background: rgba(217, 70, 239, 0.2); border: 1px solid rgba(217, 70, 239, 0.4); }

  .task-tag {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
  }

  .cost-preview {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .cost-preview.warn {
    border-color: rgba(249, 115, 22, 0.5);
    background: rgba(249, 115, 22, 0.08);
  }
  .total-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .total-label {
    color: var(--text-muted);
  }
  .total-value {
    color: var(--text-primary);
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  .total-hint {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .warn-badge {
    margin-left: 0.5rem;
    color: #fbbf24;
    font-weight: 600;
  }
  .breakdown {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.65rem;
  }
  .breakdown-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 0.6rem;
    align-items: center;
    font-size: 0.85rem;
  }
  .breakdown-tag {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border-radius: 5px;
    font-size: 0.7rem;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .breakdown-tag[data-provider='Kling'] { background: rgba(37, 99, 235, 0.2); border: 1px solid rgba(37, 99, 235, 0.35); }
  .breakdown-tag[data-provider='Seedance'] { background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.35); }
  .breakdown-tag[data-provider='Wan'] { background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.35); }
  .breakdown-tag[data-provider='PixVerse'] { background: rgba(249, 115, 22, 0.2); border: 1px solid rgba(249, 115, 22, 0.35); }
  .breakdown-tag[data-provider='Happy Horse'] { background: rgba(236, 72, 153, 0.2); border: 1px solid rgba(236, 72, 153, 0.35); }
  .breakdown-tag[data-provider='Veo'] { background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); }
  .breakdown-tag[data-provider='Hailuo'] { background: rgba(6, 182, 212, 0.2); border: 1px solid rgba(6, 182, 212, 0.4); }
  .breakdown-tag[data-provider='LTX'] { background: rgba(132, 204, 22, 0.2); border: 1px solid rgba(132, 204, 22, 0.4); }
  .breakdown-name {
    color: var(--text-primary);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .breakdown-variant {
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 0.3rem;
  }
  .breakdown-task {
    display: inline-block;
    margin-left: 0.4rem;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.7rem;
  }
  .breakdown-calc {
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .breakdown-subtotal {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    text-align: right;
    min-width: 4.5rem;
  }

  .submit {
    margin-top: 0.25rem;
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
    opacity: 0.6;
    cursor: not-allowed;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  .result-card {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.9rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  .result-card[data-phase='done'] {
    border-color: rgba(34, 197, 94, 0.4);
  }
  .result-card[data-phase='error'] {
    border-color: rgba(239, 68, 68, 0.5);
  }
  .result-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .result-model {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.9rem;
  }
  .result-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .phase-tag {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    background: var(--hover-bg);
    border-radius: var(--radius-pill);
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .phase-tag.done-tag {
    background: var(--accent);
    box-shadow: var(--accent-shadow);
  }
  .phase-tag.error-tag {
    background: #b91c1c;
  }
  .card-cost {
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
  }
  .error-msg {
    margin: 0;
    color: #fca5a5;
    font-size: 0.85rem;
    word-break: break-word;
  }
  .logs {
    margin: 0;
    padding-left: 1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    list-style: none;
    max-height: 4.5rem;
    overflow-y: auto;
  }
  .logs li {
    padding: 0.1rem 0;
  }
  .result-video {
    width: 100%;
    border-radius: 8px;
    background: #000;
    display: block;
  }
  .download {
    color: var(--text-secondary);
    text-decoration: underline;
    font-size: 0.82rem;
  }
  .download:hover {
    color: var(--text-primary);
  }
</style>
