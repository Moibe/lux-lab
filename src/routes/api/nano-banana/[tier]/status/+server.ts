import type { RequestHandler } from '@sveltejs/kit';
import { nanoBananaStatus, resolveNanoBananaTier } from '$lib/api/nano-banana';

export const GET: RequestHandler = (event) => {
  const tier = resolveNanoBananaTier(event.params.tier);
  return nanoBananaStatus(tier.endpoint)(event);
};
