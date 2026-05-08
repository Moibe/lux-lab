import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { FAL_KEY } from '$env/static/private';
import {
  fetchPricing as fetchPricingPure,
  fetchPricingBatched,
  NucleoError,
  type PriceEntry
} from '@moibe/falai-nucleo';

export type { PriceEntry };

// Studio-side wrapper that injects FAL_KEY and rethrows as SvelteKit errors.
export async function fetchPricing(endpointIds: string[]): Promise<PriceEntry[]> {
  try {
    return await fetchPricingPure(FAL_KEY, endpointIds);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
}

export const pricingHandler: RequestHandler = async ({ url }) => {
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) return json({ prices: [] });
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return json({ prices: [] });

  try {
    const prices = await fetchPricingBatched(FAL_KEY, ids);
    return json({ prices });
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
