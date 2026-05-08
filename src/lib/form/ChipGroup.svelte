<script lang="ts" generics="T extends string">
  type Option = { value: T; label: string; title?: string };

  let {
    value = $bindable(),
    options,
    label,
    disabled = false
  }: {
    value: T;
    options: Option[];
    label?: string;
    disabled?: boolean;
  } = $props();
</script>

<div class="row">
  {#if label}<span class="row-label">{label}</span>{/if}
  <div class="chip-group">
    {#each options as opt}
      <button
        type="button"
        class="chip-opt"
        class:active={value === opt.value}
        onclick={() => (value = opt.value)}
        title={opt.title}
        {disabled}
      >{opt.label}</button>
    {/each}
  </div>
</div>

<style>
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
  .chip-group {
    display: flex;
    gap: 0.4rem;
    padding: 0.3rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
  }
  .chip-opt {
    padding: 0.4rem 0.95rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .chip-opt:hover:not(:disabled) { color: var(--text-primary); }
  .chip-opt.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
  }
  .chip-opt:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
