import type { RequestHandler } from '@sveltejs/kit';
import { fluxKontextStatus, resolveKontextTier } from '$lib/api/flux-kontext';

export const GET: RequestHandler = (event) => {
  const tier = resolveKontextTier(event.params.tier);
  return fluxKontextStatus(tier.endpoint)(event);
};
