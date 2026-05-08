<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';

  const versions = [
    { href: '/kling/v3', label: 'v3' },
    { href: '/kling/o3', label: 'o3' },
    { href: '/kling/v2.6', label: 'v2.6' },
    { href: '/kling/v2.5', label: 'v2.5' },
    { href: '/kling/v2.1', label: 'v2.1' }
  ];
</script>

<BackButton />

<h1 class="title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>Kling</h1>

<nav
  class="pill-nav subnav"
  role="tablist"
  in:fly={{ y: 60, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 60, duration: 400, easing: cubicIn }}
>
  {#each versions as v}
    <a href={v.href} role="tab">{v.label}</a>
  {/each}
</nav>

<style>
  .subnav {
    margin-top: 2rem;
  }
</style>
