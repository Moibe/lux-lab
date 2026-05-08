<script lang="ts" generics="T extends string">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  type Option = { value: T; label: string; hint?: string };

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

  let open = $state(false);
  let triggerEl: HTMLButtonElement | null = $state(null);

  const current = $derived(options.find((o) => o.value === value));

  function close() {
    open = false;
  }

  function toggle() {
    if (!disabled) open = !open;
  }

  function pick(v: T) {
    value = v;
    close();
  }

  function onWindowClick(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (triggerEl && triggerEl.contains(target)) return;
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="dropdown">
  {#if label}<span class="label">{label}</span>{/if}
  <div class="wrap">
    <button
      bind:this={triggerEl}
      type="button"
      class="trigger"
      class:open
      onclick={toggle}
      {disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <span class="current">
        {current?.label ?? ''}
      </span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    {#if open}
      <ul class="menu" role="listbox" transition:slide={{ duration: 180, easing: cubicOut }}>
        {#each options as opt}
          <li>
            <button
              type="button"
              class="opt"
              class:active={opt.value === value}
              onclick={() => pick(opt.value)}
              role="option"
              aria-selected={opt.value === value}
            >
              <span class="opt-label">{opt.label}</span>
              {#if opt.hint}<span class="opt-hint">{opt.hint}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .dropdown {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
  }
  .label {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .wrap {
    position: relative;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 11rem;
    padding: 0.55rem 1rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .trigger:hover:not(:disabled) {
    background: var(--hover-bg);
  }
  .trigger.open {
    border-color: var(--accent);
  }
  .trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .current {
    flex: 1;
    text-align: left;
  }
  .caret {
    color: var(--text-muted);
    font-size: 0.7rem;
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .trigger.open .caret {
    transform: rotate(180deg);
  }
  .menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    right: 0;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    z-index: 50;
  }
  .opt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    width: 100%;
    padding: 0.55rem 0.85rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .opt:hover {
    background: var(--hover-bg);
    color: var(--text-primary);
  }
  .opt.active {
    background: var(--accent);
    color: #fff;
  }
  .opt-label {
    font-weight: 500;
  }
  .opt-hint {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 400;
  }
  .opt.active .opt-hint {
    color: rgba(255, 255, 255, 0.75);
  }
</style>
