import type { RequestHandler } from '@sveltejs/kit';
import {
  nanoBananaT2ISubmit,
  nanoBananaEditSubmit,
  resolveNanoBananaTier
} from '$lib/api/nano-banana';

export const POST: RequestHandler = (event) => {
  const tier = resolveNanoBananaTier(event.params.tier);
  const handler = tier.value === 'edit'
    ? nanoBananaEditSubmit(tier.endpoint)
    : nanoBananaT2ISubmit(tier.endpoint);
  return handler(event);
};
