<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import StatusPanel from '$lib/form/StatusPanel.svelte';
  import {
    KLING_VOICE_FORMATS,
    KLING_VOICE_MIN_SECONDS,
    KLING_VOICE_MAX_SECONDS
  } from '@moibe/falai-nucleo';

  type Phase = 'idle' | 'validating' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error';

  const ACCEPTED_EXT = KLING_VOICE_FORMATS;
  const MIN_SECONDS = KLING_VOICE_MIN_SECONDS;
  const MAX_SECONDS = KLING_VOICE_MAX_SECONDS;
  // MIME hints adicionales para que el file picker filtre correctamente en macOS/Windows.
  const MIME_HINTS = 'audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,video/mp4,video/quicktime';
  const ACCEPT_ATTR = `${ACCEPTED_EXT.map((e) => '.' + e).join(',')},${MIME_HINTS}`;

  let audioFile = $state<File | null>(null);
  let audioPreview = $state<string | null>(null);
  let audioDuration = $state<number | null>(null);
  let pastedUrl = $state('');

  let phase = $state<Phase>('idle');
  let logs = $state<string[]>([]);
  let voiceId = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let copiedFlash = $state(false);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const isRunning = $derived(
    phase === 'validating' ||
      phase === 'uploading' ||
      phase === 'submitting' ||
      phase === 'polling'
  );
  const phaseLabel: Record<Phase, string> = {
    idle: '',
    validating: 'Validando audio...',
    uploading: 'Subiendo audio...',
    submitting: 'Enviando trabajo...',
    polling: 'Registrando voz...',
    done: '¡Voz registrada!',
    error: 'Error'
  };

  function extOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i < 0 ? '' : name.slice(i + 1).toLowerCase();
  }

  async function probeDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => resolve(a.duration);
      a.onerror = () => reject(new Error('No se pudo leer el audio (formato inválido o corrupto).'));
      a.src = url;
    });
  }

  async function onAudioChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    errorMessage = null;

    const ext = extOf(f.name);
    if (!(ACCEPTED_EXT as readonly string[]).includes(ext)) {
      errorMessage = `Formato no soportado (.${ext}). Usa: ${ACCEPTED_EXT.join(', ')}.`;
      return;
    }

    if (audioPreview) URL.revokeObjectURL(audioPreview);
    const preview = URL.createObjectURL(f);

    try {
      const dur = await probeDuration(preview);
      audioFile = f;
      audioPreview = preview;
      audioDuration = dur;
      if (dur < MIN_SECONDS || dur > MAX_SECONDS) {
        errorMessage = `Duración fuera de rango: ${dur.toFixed(1)}s (debe ser ${MIN_SECONDS}-${MAX_SECONDS}s).`;
      }
    } catch (err) {
      URL.revokeObjectURL(preview);
      errorMessage = err instanceof Error ? err.message : 'Error leyendo el audio.';
    }
  }

  function clearAudio() {
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    audioFile = null;
    audioPreview = null;
    audioDuration = null;
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
    voiceId = null;
    errorMessage = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const hasFile = !!audioFile;
    const hasUrl = pastedUrl.trim().length > 0;
    if (!hasFile && !hasUrl) {
      errorMessage = 'Sube un archivo o pega una URL de audio.';
      phase = 'error';
      return;
    }
    if (hasFile && audioDuration !== null && (audioDuration < MIN_SECONDS || audioDuration > MAX_SECONDS)) {
      errorMessage = `Duración fuera de rango: ${audioDuration.toFixed(1)}s (debe ser ${MIN_SECONDS}-${MAX_SECONDS}s).`;
      phase = 'error';
      return;
    }

    reset();
    try {
      let voiceUrl: string;
      if (hasFile) {
        phase = 'uploading';
        voiceUrl = await uploadFile(audioFile!);
      } else {
        voiceUrl = pastedUrl.trim();
      }

      const submitBody: Record<string, unknown> = { voice_url: voiceUrl };
      // Si tenemos duración medida del file local, mándala — nucleo valida el rango ANTES de
      // hacer el request a fal (error inmediato en lugar de esperar el rechazo upstream).
      if (audioFile && audioDuration !== null) {
        submitBody.duration_seconds = audioDuration;
      }

      phase = 'submitting';
      const subRes = await fetch('/api/kling/create-voice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitBody)
      });
      if (!subRes.ok) throw new Error(`Submit falló: ${await subRes.text()}`);
      const { request_id } = await subRes.json();

      phase = 'polling';
      const poll = async () => {
        const r = await fetch(
          `/api/kling/create-voice/status?id=${encodeURIComponent(request_id)}`
        );
        if (!r.ok) throw new Error(`Status falló: ${await r.text()}`);
        const data = await r.json();
        if (Array.isArray(data.logs) && data.logs.length) {
          logs = data.logs.map((l: { message?: string }) => l.message ?? '');
        }
        if (data.status === 'COMPLETED') {
          voiceId = data.voice_id ?? null;
          phase = voiceId ? 'done' : 'error';
          if (!voiceId) errorMessage = 'El endpoint no devolvió voice_id.';
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

  async function copyVoiceId() {
    if (!voiceId) return;
    try {
      await navigator.clipboard.writeText(voiceId);
      copiedFlash = true;
      setTimeout(() => (copiedFlash = false), 1500);
    } catch {
      // ignore — el usuario puede seleccionar el texto manualmente
    }
  }

  $effect(() => () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (audioPreview) URL.revokeObjectURL(audioPreview);
  });

  const durationOk = $derived(
    audioDuration !== null && audioDuration >= MIN_SECONDS && audioDuration <= MAX_SECONDS
  );
</script>

<BackButton href="/kling" label="Kling" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Kling - Create Voice
</h1>

<p
  class="lede"
  in:fade={{ delay: 750, duration: 400 }}
  out:fade={{ duration: 200 }}
>
  Sube un audio limpio (5-30s, una sola voz, sin ruido) y obtén un
  <code>voice_id</code> reusable en <code>elements[].voice_id</code> de Kling v2.6 / v3.
</p>

<form
  class="form"
  onsubmit={handleSubmit}
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <div class="field">
    <span class="field-label">Muestra de audio</span>

    <label class="audio-slot" class:filled={!!audioFile} class:invalid={!!audioFile && !durationOk}>
      <input
        type="file"
        accept={ACCEPT_ATTR}
        disabled={isRunning}
        onchange={onAudioChange}
      />
      {#if audioFile}
        <div class="audio-info">
          <span class="audio-name">🎙️ {audioFile.name}</span>
          {#if audioDuration !== null}
            <span class="audio-meta" class:bad={!durationOk}>
              {audioDuration.toFixed(1)}s
              {#if !durationOk}— fuera de rango ({MIN_SECONDS}-{MAX_SECONDS}s){/if}
            </span>
          {/if}
          {#if audioPreview}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio class="audio-player" src={audioPreview} controls></audio>
          {/if}
        </div>
        <button
          type="button"
          class="clear"
          aria-label="Quitar audio"
          disabled={isRunning}
          onclick={(e) => { e.preventDefault(); clearAudio(); }}
        >×</button>
      {:else}
        <span class="placeholder">
          <span class="big">+</span>
          <span class="hint">
            Subir audio
            <br />
            <small>{ACCEPTED_EXT.map((e) => '.' + e).join(' · ')} — {MIN_SECONDS}-{MAX_SECONDS}s</small>
          </span>
        </span>
      {/if}
    </label>
  </div>

  <div class="or-divider"><span>o</span></div>

  <div class="field">
    <label class="field-label" for="voice-url">URL pública del audio</label>
    <input
      id="voice-url"
      type="url"
      bind:value={pastedUrl}
      class="url-input"
      placeholder="https://.../sample.mp3"
      disabled={isRunning || !!audioFile}
    />
    {#if audioFile}
      <small class="hint-line">Quita el archivo para usar URL.</small>
    {/if}
  </div>

  <button class="submit" type="submit" disabled={isRunning || (!!audioFile && !durationOk)}>
    {isRunning ? phaseLabel[phase] : 'Registrar voz'}
  </button>

  <StatusPanel
    {phase}
    phaseLabel={phaseLabel[phase]}
    {errorMessage}
    {logs}
  />

  {#if voiceId}
    <div class="voice-id-card" transition:fade={{ duration: 200 }}>
      <div class="voice-id-label">voice_id</div>
      <div class="voice-id-row">
        <code class="voice-id-value">{voiceId}</code>
        <button
          type="button"
          class="copy-btn"
          onclick={copyVoiceId}
          aria-label="Copiar voice_id"
        >
          {copiedFlash ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <small class="voice-id-hint">
        Úsalo en <code>elements[].voice_id</code> al generar con Kling v2.6 / v3.
      </small>
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
  .lede code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.1em 0.4em;
    border-radius: 4px;
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

  .audio-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 10rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-card);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .audio-slot:hover:not(:has(input:disabled)) {
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(255, 255, 255, 0.05);
  }
  .audio-slot.filled {
    border-style: solid;
    border-color: rgba(80, 200, 120, 0.4);
    cursor: default;
  }
  .audio-slot.invalid {
    border-color: rgba(239, 68, 68, 0.5);
  }
  .audio-slot input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .audio-slot.filled input[type='file'] {
    display: none;
  }
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    text-align: center;
  }
  .placeholder .big {
    font-size: 2rem;
    line-height: 1;
  }
  .placeholder small {
    font-size: 0.75rem;
  }
  .audio-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    align-items: stretch;
  }
  .audio-name {
    color: var(--text-primary);
    font-size: 0.95rem;
    word-break: break-all;
  }
  .audio-meta {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .audio-meta.bad {
    color: rgb(239, 130, 130);
  }
  .audio-player {
    width: 100%;
    margin-top: 0.25rem;
  }
  .clear {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    line-height: 1;
  }
  .clear:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .or-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: -0.4rem 0;
  }
  .or-divider::before,
  .or-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
  }

  .url-input {
    background: rgba(255, 255, 255, 0.04);
    border: var(--border-subtle);
    border-radius: 8px;
    padding: 0.6rem 0.85rem;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .url-input:focus {
    border-color: var(--accent);
  }
  .url-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .hint-line {
    color: var(--text-muted);
    font-size: 0.8rem;
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

  .voice-id-card {
    padding: 1rem 1.25rem;
    background: rgba(80, 200, 120, 0.08);
    border: 1px solid rgba(80, 200, 120, 0.3);
    border-radius: var(--radius-card);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .voice-id-label {
    color: var(--text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .voice-id-row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  .voice-id-value {
    flex: 1;
    padding: 0.55rem 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem;
    color: var(--text-primary);
    user-select: all;
    word-break: break-all;
  }
  .copy-btn {
    padding: 0.55rem 0.95rem;
    background: rgba(255, 255, 255, 0.08);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background var(--transition-fast);
    white-space: nowrap;
  }
  .copy-btn:hover {
    background: rgba(255, 255, 255, 0.14);
  }
  .voice-id-hint {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .voice-id-hint code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.05em 0.35em;
    border-radius: 4px;
  }
</style>
