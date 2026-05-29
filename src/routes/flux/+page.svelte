<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';

  const modes = [
    { href: '/flux/2-pro', label: '2 Pro', hint: 'Text → Image' },
    { href: '/flux/pulid', label: 'PuLID', hint: 'Identidad facial → Escena' },
    { href: '/flux/kontext', label: 'Kontext', hint: 'Image → Image (lookbooks)' }
  ];
</script>

<BackButton />

<h1 class="title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>Flux</h1>

<nav
  class="pill-nav subnav"
  role="tablist"
  in:fly={{ y: 60, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 60, duration: 400, easing: cubicIn }}
>
  {#each modes as m}
    <a href={m.href} role="tab" class="mode-link">
      <span class="mode-label">{m.label}</span>
      <span class="mode-hint">{m.hint}</span>
    </a>
  {/each}
</nav>

<style>
  .subnav {
    margin-top: 2rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .mode-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    line-height: 1.15;
  }
  .mode-hint {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-weight: 400;
  }
</style>
