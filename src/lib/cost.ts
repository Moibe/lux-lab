import type { PriceMap } from '@moibe/falai-nucleo';

export {
  AUDIO_MULTIPLIER,
  estimateCost,
  formatCost,
  type PriceMap,
  type PriceEntry
} from '@moibe/falai-nucleo';

const cache: PriceMap = {};

// Browser-side helper: hits studio's /api/pricing route, which proxies fal.ai.
export async function fetchPriceMap(endpointIds: string[]): Promise<PriceMap> {
  const missing = endpointIds.filter((id) => !(id in cache));
  if (missing.length > 0) {
    const url = `/api/pricing?ids=${encodeURIComponent(missing.join(','))}`;
    const res = await fetch(url);
    if (res.ok) {
      const { prices } = await res.json();
      for (const p of prices ?? []) {
        cache[p.endpoint_id] = {
          unit_price: p.unit_price,
          unit: p.unit,
          currency: p.currency
        };
      }
    }
  }
  const out: PriceMap = {};
  for (const id of endpointIds) {
    if (cache[id]) out[id] = cache[id];
  }
  return out;
}
