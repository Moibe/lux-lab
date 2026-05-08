<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicIn, expoOut } from 'svelte/easing';
  import { dramaticIn, dramaticOut } from '$lib/transitions';
  import BackButton from '$lib/BackButton.svelte';
  import { KNOWN_ENDPOINTS, type KnownEndpoint } from '$lib/known-endpoints';
  import { fetchPriceMap, formatCost, type PriceMap } from '$lib/cost';

  type Row = KnownEndpoint & {
    unit_price: number | null;
    unit: string | null;
  };

  type Group = {
    provider: string;
    cheapest: number;
    rows: Row[];
  };

  const I2V_ENDPOINTS = KNOWN_ENDPOINTS.filter((e) => e.task === 'I2V');

  let priceMap = $state<PriceMap>({});
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    (async () => {
      try {
        const ids = I2V_ENDPOINTS.map((e) => e.id);
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
    I2V_ENDPOINTS.map((e) => ({
      ...e,
      unit_price: priceMap[e.id]?.unit_price ?? null,
      unit: priceMap[e.id]?.unit ?? null
    }))
  );

  const groups = $derived.by<Group[]>(() => {
    const byProvider = new Map<string, Row[]>();
    for (const r of rows) {
      if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
      byProvider.get(r.provider)!.push(r);
    }
    const out: Group[] = [];
    for (const [provider, list] of byProvider.entries()) {
      // Sort within provider by price ascending; nulls last
      list.sort((a, b) => {
        if (a.unit_price === null && b.unit_price === null) return 0;
        if (a.unit_price === null) return 1;
        if (b.unit_price === null) return -1;
        return a.unit_price - b.unit_price;
      });
      // Cheapest of provider (Infinity if none priced yet)
      const cheapest =
        list.find((r) => r.unit_price !== null)?.unit_price ?? Number.POSITIVE_INFINITY;
      out.push({ provider, cheapest, rows: list });
    }
    // Sort providers by cheapest endpoint ascending
    out.sort((a, b) => a.cheapest - b.cheapest);
    return out;
  });

  function estimate(unitPrice: number | null, seconds: number, unit: string | null): string {
    if (unitPrice === null) return '—';
    if (unit !== 'second') return '—';
    return formatCost(unitPrice * seconds);
  }
</script>

<BackButton href="/precios" label="Precios" />

<h1 class="title page-title" in:dramaticIn={{ delay: 500 }} out:dramaticOut={{}}>
  Comparativa Image-to-Video
</h1>

<section
  class="content"
  in:fly={{ y: 40, duration: 700, delay: 900, easing: expoOut }}
  out:fly={{ y: 40, duration: 400, easing: cubicIn }}
>
  <p class="intro">
    Comparativa lado a lado de endpoints I2V por proveedor. Agrupados por proveedor (el más barato
    primero) y dentro de cada uno ordenados por precio ascendente. Estimaciones de 5s y 10s asumen
    tarifa lineal sin audio.
  </p>

  {#if loading}
    <p class="status-msg">Cargando precios...</p>
  {:else if error}
    <p class="status-msg error">Error: {error}</p>
  {/if}

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Modelo · Variante</th>
          <th class="num">$/s</th>
          <th class="num">5s</th>
          <th class="num">10s</th>
        </tr>
      </thead>
      <tbody>
        {#each groups as group (group.provider)}
          {#each group.rows as row, idx (row.id)}
            <tr class:group-start={idx === 0}>
              <td>
                {#if idx === 0}
                  <span class="provider-tag" data-provider={row.provider}>{row.provider}</span>
                {/if}
              </td>
              <td>
                <strong>{row.model}</strong>
                {#if row.variant && row.variant !== '-'}
                  <span class="variant"> · {row.variant}</span>
                {/if}
              </td>
              <td class="num">
                {#if row.unit_price !== null && row.unit === 'second'}
                  <strong>${row.unit_price.toFixed(3)}</strong>
                {:else if row.unit_price !== null}
                  <strong>${row.unit_price.toFixed(3)}</strong><small>/{row.unit ?? 'unit'}</small>
                {:else}
                  <span class="muted">—</span>
                {/if}
              </td>
              <td class="num">{estimate(row.unit_price, 5, row.unit)}</td>
              <td class="num">{estimate(row.unit_price, 10, row.unit)}</td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>

  <section class="diff-section">
    <h2 class="diff-title">Diferenciadores clave</h2>
    <ul class="diff-list">
      <li>
        <span class="provider-tag" data-provider="Kling">Kling v3</span>
        max 15s, multi-shot, elements (frontal+refs), audio nativo, tiers 4K/Pro/Standard.
      </li>
      <li>
        <span class="provider-tag" data-provider="Kling">Kling o3</span>
        igual que v3 + reference-to-video con <code>@Image</code>, <code>voice_id</code> por
        elemento.
      </li>
      <li>
        <span class="provider-tag" data-provider="Kling">Kling v2.6</span>
        schema simple, sin elements, <code>voice_ids</code> array a top-level.
      </li>
      <li>
        <span class="provider-tag" data-provider="Kling">Kling v2.x/v1.x</span>
        legacy, schemas más simples.
      </li>
      <li>
        <span class="provider-tag" data-provider="Seedance">Seedance 1.0/2.0</span>
        variantes Pro/Lite (1.0), 2.0 con reference-to-video propio.
      </li>
      <li>
        <span class="provider-tag" data-provider="Wan">Wan v2.2</span>
        open-weight de Alibaba (5B params).
      </li>
      <li>
        <span class="provider-tag" data-provider="PixVerse">PixVerse v3.5</span>
        con <code>extend</code> para alargar videos existentes.
      </li>
      <li>
        <span class="provider-tag" data-provider="Happy Horse">Happy Horse 1.0</span>
        nuevo de Alibaba (abril 2026), sin tiers (<code>resolution</code> 720p/1080p en su lugar),
        seed determinístico, safety checker explícito, 5 aspect ratios.
      </li>
    </ul>
  </section>
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

  .status-msg {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .status-msg.error {
    color: #fca5a5;
  }

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
  th.num,
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background var(--transition-fast);
  }
  tbody tr.group-start {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  tbody tr.group-start:first-child {
    border-top: none;
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  tbody tr:last-child {
    border-bottom: none;
  }
  td {
    padding: 0.65rem 0.9rem;
    color: var(--text-secondary);
    vertical-align: middle;
  }
  td strong {
    color: var(--text-primary);
  }
  td small {
    color: var(--text-muted);
    margin-left: 0.2rem;
  }
  td .muted {
    color: var(--text-muted);
  }
  .variant {
    color: var(--text-muted);
  }

  .provider-tag {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary);
  }
  .provider-tag[data-provider='Kling'] {
    background: rgba(37, 99, 235, 0.2);
    border: 1px solid rgba(37, 99, 235, 0.35);
  }
  .provider-tag[data-provider='Seedance'] {
    background: rgba(168, 85, 247, 0.2);
    border: 1px solid rgba(168, 85, 247, 0.35);
  }
  .provider-tag[data-provider='Wan'] {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.35);
  }
  .provider-tag[data-provider='PixVerse'] {
    background: rgba(249, 115, 22, 0.2);
    border: 1px solid rgba(249, 115, 22, 0.35);
  }
  .provider-tag[data-provider='Happy Horse'] {
    background: rgba(236, 72, 153, 0.2);
    border: 1px solid rgba(236, 72, 153, 0.35);
  }

  .diff-section {
    padding: 1rem 1.25rem;
    background: var(--surface-pill);
    border: var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  .diff-title {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }
  .diff-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .diff-list li {
    display: block;
  }
  .diff-list .provider-tag {
    margin-right: 0.4rem;
  }
  .diff-list code {
    padding: 0.05rem 0.3rem;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    color: var(--text-primary);
  }
</style>
