<script lang="ts">
  import { page } from '$app/state';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';

  const version = $derived(page.params.version);
</script>

<BackButton href="/kling" label="Kling" />

<h1 class="title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>Kling - {version}</h1>
