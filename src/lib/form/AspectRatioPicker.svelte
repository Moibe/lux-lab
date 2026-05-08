<script lang="ts" generics="T extends string">
  type Option = { value: T; label: string; w: number; h: number };

  let {
    value = $bindable(),
    options,
    label = 'Formato:',
    disabled = false
  }: {
    value: T;
    options: Option[];
    label?: string;
    disabled?: boolean;
  } = $props();
</script>

<div class="aspect-row">
  {#if label}<span class="aspect-label">{label}</span>{/if}
  <div class="aspect-options">
    {#each options as opt}
      <button
        type="button"
        class="aspect-btn"
        class:active={value === opt.value}
        onclick={() => (value = opt.value)}
        {disabled}
      >
        <span class="aspect-shape" style="width: {opt.w}px; height: {opt.h}px;"></span>
        <span class="aspect-label-text">{opt.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .aspect-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .aspect-label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .aspect-options {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .aspect-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.55rem 0.75rem;
    min-width: 64px;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background var(--transition-fast), border-color var(--transition-fast),
      color var(--transition-fast);
  }
  .aspect-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary);
  }
  .aspect-btn.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
  }
  .aspect-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .aspect-shape {
    background: currentColor;
    opacity: 0.7;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .aspect-btn.active .aspect-shape { opacity: 1; }
  .aspect-label-text {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
</style>
