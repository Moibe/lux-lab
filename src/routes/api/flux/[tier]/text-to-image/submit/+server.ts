import { error, type RequestHandler } from '@sveltejs/kit';
import { flux2ProSubmit } from '$lib/api/flux';
import { FLUX_TIERS } from '$lib/flux-options';

export const POST: RequestHandler = async (event) => {
  const slug = event.params.tier!;
  const tier = FLUX_TIERS.find((t) => t.value === slug);
  if (!tier) throw error(404, `Flux tier "${slug}" no existe`);
  if (!tier.endpoints.t2i) throw error(404, `Flux tier "${slug}" no soporta text-to-image`);
  return flux2ProSubmit(tier.endpoints.t2i)(event);
};
