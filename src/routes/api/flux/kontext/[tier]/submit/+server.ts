import type { RequestHandler } from '@sveltejs/kit';
import { fluxKontextSubmit, resolveKontextTier } from '$lib/api/flux-kontext';

export const POST: RequestHandler = (event) => {
  const tier = resolveKontextTier(event.params.tier);
  return fluxKontextSubmit(tier.endpoint)(event);
};
