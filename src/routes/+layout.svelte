<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="screen">
  {@render children()}
</div>

<style>
  :global(:root) {
    /* Surfaces */
    --surface-pill: #1a1f2e;
    --bg-gradient-start: #002147;
    --bg-gradient-end: #000a1a;

    /* Text */
    --text-primary: #fff;
    --text-secondary: rgba(230, 236, 245, 0.85);
    --text-muted: rgba(230, 236, 245, 0.7);

    /* Borders & hover */
    --border-subtle: 1px solid rgba(255, 255, 255, 0.08);
    --hover-bg: rgba(255, 255, 255, 0.05);

    /* Accent */
    --accent: #2563eb;
    --accent-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);

    /* Effects */
    --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.35);
    --title-glow: 0 4px 24px rgba(77, 139, 255, 0.25);
    --radius-pill: 999px;
    --radius-card: 16px;

    /* Typography */
    --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --font-size-title: 3.5rem;
    --font-size-body: 0.95rem;

    /* Motion */
    --transition-fast: 120ms ease;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  :global(body) {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
    background-attachment: fixed;
    color: var(--text-secondary);
    font-family: var(--font-sans);
  }

  /* Shared primitives */
  :global(.pill-nav) {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-card);
  }
  :global(.pill-nav a) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 1.1rem;
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: var(--font-size-body);
    font-weight: 500;
    white-space: nowrap;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  :global(.pill-nav a:hover) {
    color: var(--text-primary);
    background: var(--hover-bg);
  }
  :global(.pill-nav a.active) {
    background: var(--accent);
    color: var(--text-primary);
    box-shadow: var(--accent-shadow);
  }

  :global(.title) {
    margin: 0;
    font-size: var(--font-size-title);
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    text-shadow: var(--title-glow);
  }

  .screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    box-sizing: border-box;
  }
</style>
