import type { RequestHandler } from '@sveltejs/kit';
import { nanoBanana2Status, resolveNanoBanana2Tier } from '$lib/api/nano-banana-2';

export const GET: RequestHandler = (event) => {
  const tier = resolveNanoBanana2Tier(event.params.tier);
  return nanoBanana2Status(tier.endpoint)(event);
};
