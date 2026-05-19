<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';

  const tabs = [
    { href: '/kling', label: 'Kling', icon: '🎬' },
    { href: '/seedance', label: 'Seedance', icon: '💃' },
    { href: '/wan', label: 'Wan', icon: '🌊' },
    { href: '/happy-horse', label: 'Happy Horse', icon: '🐎' },
    { href: '/pixverse', label: 'PixVerse', icon: '✨' },
    { href: '/veo3.1', label: 'Veo 3.1', icon: '🎥' },
    { href: '/hailuo-02', label: 'Hailuo-02', icon: '⚡' },
    { href: '/ltx-2.3', label: 'LTX-2.3', icon: '🎞️' },
    { href: '/omnihuman', label: 'Omnihuman', icon: '🗣️' },
    { href: '/flux', label: 'Flux', icon: '🖼️' }
  ];
</script>

<nav
  class="pill-nav"
  role="tablist"
  in:fly={{ y: -260, duration: 750, delay: 350, easing: expoOut }}
  out:fly={{ y: -260, duration: 500, easing: cubicIn }}
>
  {#each tabs as tab}
    <a href={tab.href} role="tab">
      <span class="icon">{tab.icon}</span>
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>

<a
  href="/precios"
  class="pricing-link"
  in:fade={{ duration: 400, delay: 1100 }}
  out:fade={{ duration: 200 }}
>
  💵 Comparativa de costos →
</a>

<a
  href="/lab"
  class="pricing-link"
  in:fade={{ duration: 400, delay: 1250 }}
  out:fade={{ duration: 200 }}
>
  🧪 Lab cross-provider →
</a>

<style>
  .icon {
    font-size: 1rem;
    line-height: 1;
  }

  .pricing-link {
    margin-top: 1.5rem;
    padding: 0.5rem 1rem;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
    border-radius: var(--radius-pill);
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .pricing-link:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
  }
</style>
