<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import { KNOWN_ENDPOINTS, type KnownEndpoint } from '$lib/known-endpoints';
  import { fetchPriceMap, type PriceMap } from '$lib/cost';

  type Row = KnownEndpoint & {
    unit_price: number | null;
    unit: string | null;
  };

  type SortKey = 'provider' | 'price' | 'task';
  let sortKey = $state<SortKey>('provider');
  let filterText = $state('');

  let priceMap = $state<PriceMap>({});
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    (async () => {
      try {
        const ids = KNOWN_ENDPOINTS.map((e) => e.id);
        const map = await fetchPriceMap(ids);
        priceMap = map;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Error desconocido';
      } finally {
        loading = false;
      }
    })();
  });

  const rows = $derived<Row[]>(
    KNOWN_ENDPOINTS.map((e) => ({
      ...e,
      unit_price: priceMap[e.id]?.unit_price ?? null,
      unit: priceMap[e.id]?.unit ?? null
    }))
  );

  const filtered = $derived.by<Row[]>(() => {
    const q = filterText.trim().toLowerCase();
    let arr = rows;
    if (q) {
      arr = arr.filter(
        (r) =>
          r.provider.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          r.variant.toLowerCase().includes(q) ||
          r.task.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }
    const sorted = [...arr];
    if (sortKey === 'price') {
      sorted.sort((a, b) => {
        if (a.unit_price === null && b.unit_price === null) return 0;
        if (a.unit_price === null) return 1;
        if (b.unit_price === null) return -1;
        return a.unit_price - b.unit_price;
      });
    } else if (sortKey === 'task') {
      sorted.sort((a, b) => a.task.localeCompare(b.task) || a.provider.localeCompare(b.provider));
    } else {
      sorted.sort(
        (a, b) =>
          a.provider.localeCompare(b.provider) ||
          a.model.localeCompare(b.model) ||
          a.variant.localeCompare(b.variant) ||
          a.task.localeCompare(b.task)
      );
    }
    return sorted;
  });

  const fetchedCount = $derived(rows.filter((r) => r.unit_price !== null).length);
  const missingCount = $derived(rows.filter((r) => r.unit_price === null).length);

  function costFor(unitPrice: number | null, seconds: number): string {
    if (unitPrice === null) return '—';
    return `$${(unitPrice * seconds).toFixed(2)}`;
  }
</script>

<BackButton href="/" label="Inicio" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Comparativa de costos
</h1>

<section
  class="content"
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Precios en vivo de fal.ai por endpoint. Para video, "$/s" es por segundo de video generado;
    para imagen, "$/imagen" por generación. Estimaciones de 5s y 10s asumen tarifa lineal.
    El audio puede agregar ~25% extra (no incluido en la estimación).
  </p>

  <a href="/precios/i2v" class="i2v-link">→ Comparativa Image-to-Video detallada</a>

  <div class="controls">
    <input
      type="search"
      placeholder="Filtrar por proveedor, modelo, task, slug..."
      bind:value={filterText}
      class="filter"
    />
    <div class="sort-group">
      <span class="sort-label">Ordenar:</span>
      <button class:active={sortKey === 'provider'} onclick={() => (sortKey = 'provider')}>Proveedor</button>
      <button class:active={sortKey === 'price'} onclick={() => (sortKey = 'price')}>Precio ↑</button>
      <button class:active={sortKey === 'task'} onclick={() => (sortKey = 'task')}>Task</button>
    </div>
  </div>

  {#if loading}
    <p class="status-msg">Cargando precios...</p>
  {:else if error}
    <p class="status-msg error">Error: {error}</p>
  {:else}
    <p class="status-msg">
      {fetchedCount} con precio · {missingCount} sin datos en la API
    </p>
  {/if}

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Modelo</th>
          <th>Variante</th>
          <th>Task</th>
          <th class="num">Unit price</th>
          <th class="num">5s</th>
          <th class="num">10s</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as row (row.id)}
          <tr>
            <td><span class="provider-tag" data-provider={row.provider}>{row.provider}</span></td>
            <td>{row.model}</td>
            <td>{row.variant}</td>
            <td><span class="task-tag">{row.task}</span></td>
            <td class="num">
              {#if row.unit_price !== null}
                <strong>${row.unit_price.toFixed(3)}</strong>
                <small>/{row.unit ?? 'unit'}</small>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td class="num">{row.unit === 'second' ? costFor(row.unit_price, 5) : '—'}</td>
            <td class="num">{row.unit === 'second' ? costFor(row.unit_price, 10) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <details class="note-block">
    <summary>Notas</summary>
    <ul>
      <li><strong>Happy Horse</strong> (Alibaba, lanzado abril 2026): mismo conjunto de tasks que Kling o3 (i2v, t2v, r2v, edit) pero sin tiers — un solo nivel con selector de <code>resolution</code> (720p/1080p) en su lugar. Schema propio (incluye <code>seed</code> determinístico).</li>
      <li>El audio puede modificar el costo (~+25% observado en o3 R2V). No reflejado en la tabla.</li>
      <li>Endpoints sin precio en API ("—") pueden requerir auth distinta o estar en versión "preview".</li>
      <li>Si fal devuelve diferente unit ("image", "second", etc.), las columnas 5s/10s solo aplican cuando unit = "second".</li>
    </ul>
  </details>
</section>

<style>
  .page-title {
    text-align: center;
    max-width: min(1100px, 92vw);
    line-height: 1.1;
  }
  .content {
    margin-top: 2rem;
    width: min(1100px, 95vw);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .intro {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .i2v-link {
    display: inline-block;
    align-self: flex-start;
    padding: 0.45rem 0.85rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }
  .i2v-link:hover {
    background: var(--accent);
    color: #fff;
    transform: translateX(3px);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .filter {
    flex: 1;
    min-width: 16rem;
    padding: 0.55rem 0.85rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 0.95rem;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .filter:focus { border-color: var(--accent); }
  .filter::placeholder { color: var(--text-muted); }

  .sort-group {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-pill);
  }
  .sort-label { color: var(--text-muted); font-size: 0.85rem; padding-left: 0.5rem; }
  .sort-group button {
    padding: 0.35rem 0.85rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-pill);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .sort-group button:hover { color: var(--text-primary); }
  .sort-group button.active {
    background: var(--accent);
    color: #fff;
    box-shadow: var(--accent-shadow);
  }

  .status-msg {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .status-msg.error { color: #fca5a5; }

  .table-wrap {
    overflow-x: auto;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-sans);
    font-size: 0.9rem;
  }
  thead {
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  th {
    padding: 0.7rem 0.9rem;
    text-align: left;
    color: var(--text-muted);
    font-weight: 500;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background var(--transition-fast);
  }
  tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
  tbody tr:last-child { border-bottom: none; }
  td {
    padding: 0.65rem 0.9rem;
    color: var(--text-secondary);
  }
  td strong { color: var(--text-primary); }
  td small { color: var(--text-muted); margin-left: 0.2rem; }
  td .muted { color: var(--text-muted); }

  .provider-tag {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .provider-tag[data-provider='Kling'] { background: rgba(37, 99, 235, 0.2); border: 1px solid rgba(37, 99, 235, 0.35); }
  .provider-tag[data-provider='Seedance'] { background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.35); }
  .provider-tag[data-provider='Wan'] { background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.35); }
  .provider-tag[data-provider='PixVerse'] { background: rgba(249, 115, 22, 0.2); border: 1px solid rgba(249, 115, 22, 0.35); }

  .task-tag {
    display: inline-block;
    padding: 0.1rem 0.45rem;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
  }

  .note-block {
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.02);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .note-block summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .note-block ul {
    margin: 0.6rem 0 0;
    padding-left: 1.2rem;
    line-height: 1.6;
  }
  .note-block li { margin-bottom: 0.35rem; }
  .note-block strong { color: var(--text-primary); }
</style>
