<script lang="ts">
  import { formatCost, AUDIO_MULTIPLIER } from '$lib/cost';

  let {
    unitPrice,
    duration,
    audio = false,
    flat = false,
    flatLabel = 'por segundo de video resultante'
  }: {
    unitPrice: number | null;
    duration?: number;
    audio?: boolean;
    flat?: boolean; // when true, just show price/s without total estimate
    flatLabel?: string;
  } = $props();

  const total = $derived(
    !flat && unitPrice !== null && duration !== undefined
      ? unitPrice * duration * (audio ? AUDIO_MULTIPLIER : 1)
      : null
  );
</script>

<div class="cost-estimate">
  {#if flat}
    <span class="cost-label">Precio:</span>
    <strong class="cost-value">
      {unitPrice !== null ? `$${unitPrice.toFixed(3)}/s` : '...'}
    </strong>
    <small class="cost-hint">{flatLabel}</small>
  {:else}
    <span class="cost-label">Costo estimado:</span>
    <strong class="cost-value">
      {total !== null ? formatCost(total) : '...'}
    </strong>
    {#if unitPrice !== null && duration !== undefined}
      <small class="cost-hint">
        {duration}s × ${unitPrice.toFixed(3)}/s{audio ? ` × ${AUDIO_MULTIPLIER} audio` : ''}
      </small>
    {/if}
  {/if}
</div>

<style>
  .cost-estimate {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.6rem 0.9rem;
    background: rgba(255, 255, 255, 0.03);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  .cost-label { color: var(--text-muted); }
  .cost-value {
    color: var(--text-primary);
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .cost-hint {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
