<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';

  const modes = [
    { href: '/nano-banana/legacy/edit', label: 'Edit', hint: 'v1 Remove / add / swap' },
    { href: '/nano-banana/legacy/t2i', label: 'T2I', hint: 'v1 Text → Image' }
  ];
</script>

<BackButton href="/nano-banana" label="Nano Banana" />

<h1 class="title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Nano Banana <span class="legacy-tag">legacy v1</span>
</h1>

<p class="lede" in:fade={{ delay: 750, duration: 400 }} out:fade={{ duration: 200 }}>
  Endpoints v1 mantenidos por compatibilidad. Para código nuevo, usa
  <a href="/nano-banana">Nano Banana 2</a>.
</p>

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
  .legacy-tag {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.15rem 0.55rem;
    background: rgba(180, 140, 60, 0.18);
    border: 1px solid rgba(180, 140, 60, 0.4);
    border-radius: 999px;
    color: rgb(220, 180, 100);
    font-size: 0.55em;
    font-weight: 500;
    vertical-align: middle;
    letter-spacing: 0.04em;
  }
  .lede {
    margin-top: 0.5rem;
    max-width: min(600px, 92vw);
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .lede a {
    color: var(--accent);
    text-decoration: none;
  }
  .lede a:hover {
    text-decoration: underline;
  }
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
