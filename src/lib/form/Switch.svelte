<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    disabled = false
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
  } = $props();
</script>

<label class="switch" class:disabled>
  <span class="label">{label}</span>
  <span class="track" class:on={checked}>
    <input type="checkbox" bind:checked {disabled} />
    <span class="thumb"></span>
  </span>
</label>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    user-select: none;
  }
  .switch.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .track {
    position: relative;
    width: 44px;
    height: 24px;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: 999px;
    transition: background 200ms ease;
    flex-shrink: 0;
  }
  .track.on {
    background: var(--accent);
    box-shadow: var(--accent-shadow);
  }
  .track input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    margin: 0;
  }
  .switch.disabled .track input {
    cursor: not-allowed;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }
  .track.on .thumb {
    transform: translateX(20px);
  }
</style>
