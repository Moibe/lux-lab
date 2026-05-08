<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let {
    title,
    icon = '',
    open = $bindable(false),
    children
  }: {
    title: string;
    icon?: string;
    open?: boolean;
    children: import('svelte').Snippet;
  } = $props();
</script>

<div class="collapsible">
  <button type="button" class="trigger" class:open onclick={() => (open = !open)}>
    <span class="caret">▶</span>
    {#if icon}<span class="icon">{icon}</span>{/if}
    <span class="title">{title}</span>
  </button>
  {#if open}
    <div class="content" transition:slide={{ duration: 250, easing: cubicOut }}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .collapsible {
    width: 100%;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: color var(--transition-fast);
  }
  .trigger:hover {
    color: var(--text-primary);
  }
  .caret {
    display: inline-block;
    font-size: 0.7rem;
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text-muted);
  }
  .trigger.open .caret {
    transform: rotate(90deg);
  }
  .icon {
    font-size: 1.05rem;
  }
  .content {
    padding: 0.5rem 0.5rem 0.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
