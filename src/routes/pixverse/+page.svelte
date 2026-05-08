<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import { PIXVERSE_OPTIONS } from '$lib/pixverse-options';
</script>

<BackButton />

<h1 class="title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>PixVerse</h1>

<nav
  class="pill-nav subnav"
  role="tablist"
  in:fly={{ y: 60, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 60, duration: 400, easing: cubicIn }}
>
  {#each PIXVERSE_OPTIONS as o}
    <a href="/pixverse/{o.slug}" role="tab">{o.label}</a>
  {/each}
</nav>

<style>
  .subnav {
    margin-top: 2rem;
    flex-wrap: wrap;
    justify-content: center;
    max-width: min(900px, 92vw);
  }
</style>
