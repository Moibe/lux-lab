import type { RequestHandler } from '@sveltejs/kit';
import {
  nanoBanana2T2ISubmit,
  nanoBanana2EditSubmit,
  resolveNanoBanana2Tier
} from '$lib/api/nano-banana-2';

export const POST: RequestHandler = (event) => {
  const tier = resolveNanoBanana2Tier(event.params.tier);
  const handler = tier.value === 'edit'
    ? nanoBanana2EditSubmit(tier.endpoint)
    : nanoBanana2T2ISubmit(tier.endpoint);
  return handler(event);
};
