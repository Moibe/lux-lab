<script lang="ts">
  let {
    value = $bindable(),
    min,
    max,
    step = 1,
    label,
    suffix = '',
    leftHint = '',
    rightHint = '',
    disabled = false
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    label: string;
    suffix?: string;
    leftHint?: string;
    rightHint?: string;
    disabled?: boolean;
  } = $props();
</script>

<div class="slider-field" class:disabled>
  <div class="header">
    <span class="label">{label}</span>
    <span class="value">{value}{suffix}</span>
  </div>
  <input type="range" {min} {max} {step} bind:value {disabled} />
  {#if leftHint || rightHint}
    <div class="hints">
      <span>{leftHint}</span>
      <span>{rightHint}</span>
    </div>
  {/if}
</div>

<style>
  .slider-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 100%;
  }
  .slider-field.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .value {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: 999px;
    outline: none;
    cursor: pointer;
    margin: 0;
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: var(--accent-shadow);
    transition: transform var(--transition-fast);
  }
  input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  input[type='range']::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--accent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: var(--accent-shadow);
  }
  .hints {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
