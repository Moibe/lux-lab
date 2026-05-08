<script lang="ts">
  import { fade } from 'svelte/transition';

  let { href = '/', label = 'Volver' }: { href?: string; label?: string } = $props();
</script>

<a
  {href}
  class="back"
  aria-label={label}
  in:fade={{ duration: 350, delay: 700 }}
  out:fade={{ duration: 200 }}
>
  <span class="arrow" aria-hidden="true">←</span>
  <span>{label}</span>
</a>

<style>
  .back {
    position: fixed;
    top: 1.5rem;
    left: 1.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem 0.5rem 0.85rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background var(--transition-fast), color var(--transition-fast),
      transform var(--transition-fast);
    z-index: 10;
  }
  .back:hover {
    color: var(--text-primary);
    background: var(--hover-bg);
    transform: translateX(-3px);
  }
  .arrow {
    font-size: 1.1rem;
    line-height: 1;
  }
</style>
