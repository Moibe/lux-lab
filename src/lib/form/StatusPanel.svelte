<script lang="ts">
  import { fade } from 'svelte/transition';

  type Phase = 'idle' | 'uploading' | 'submitting' | 'polling' | 'done' | 'error' | string;

  let {
    phase,
    phaseLabel,
    errorMessage = null,
    logs = [],
    resultUrl = null,
    resultLabel = 'Descargar video',
    asImage = false
  }: {
    phase: Phase;
    phaseLabel: string;
    errorMessage?: string | null;
    logs?: string[];
    resultUrl?: string | null;
    resultLabel?: string;
    asImage?: boolean;
  } = $props();
</script>

{#if phase !== 'idle'}
  <div class="status" transition:fade={{ duration: 200 }}>
    <div class="status-line">
      <span
        class="phase-tag"
        class:error-tag={phase === 'error'}
        class:done-tag={phase === 'done'}
      >
        {phaseLabel}
      </span>
    </div>
    {#if errorMessage}
      <p class="error-msg">{errorMessage}</p>
    {/if}
    {#if logs.length}
      <ul class="logs">
        {#each logs.slice(-6) as line}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
    {#if resultUrl}
      {#if asImage}
        <img class="result-image" src={resultUrl} alt="Resultado" />
      {:else}
        <video class="result-video" src={resultUrl} controls autoplay loop></video>
      {/if}
      <a class="download" href={resultUrl} download>{resultLabel}</a>
    {/if}
  </div>
{/if}

<style>
  .status {
    margin-top: 0.5rem;
    padding: 1rem 1.25rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    color: var(--text-secondary);
  }
  .status-line { display: flex; align-items: center; gap: 0.5rem; }
  .phase-tag {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: var(--hover-bg);
    border-radius: var(--radius-pill);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  .phase-tag.done-tag { background: var(--accent); box-shadow: var(--accent-shadow); }
  .phase-tag.error-tag { background: #b91c1c; }
  .error-msg { margin: 0.75rem 0 0; color: #fca5a5; font-size: 0.9rem; }
  .logs {
    margin: 0.75rem 0 0;
    padding-left: 1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
    list-style: none;
    max-height: 8rem;
    overflow-y: auto;
  }
  .logs li {
    padding: 0.15rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .result-video, .result-image {
    margin-top: 0.75rem;
    width: 100%;
    border-radius: 8px;
    background: #000;
    display: block;
  }
  .download {
    display: inline-block;
    margin-top: 0.5rem;
    color: var(--text-primary);
    text-decoration: underline;
    font-size: 0.9rem;
  }
</style>
