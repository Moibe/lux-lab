import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitFluxKontext,
  statusFluxKontext,
  resultFluxKontext,
  FLUX_KONTEXT_TIERS,
  NucleoError,
  type FluxKontextTierMeta
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

/**
 * Resuelve el tier de Kontext desde un slug del URL. Lanza `error(404)` si el
 * slug no está en el allowlist `FLUX_KONTEXT_TIERS`. Sustituye al par anterior
 * `isValidKontextTier` + `resolveKontextEndpoint` (un único lookup contra el
 * catálogo y mensaje de error consistente).
 */
export function resolveKontextTier(slug: string | undefined): FluxKontextTierMeta {
  const tier = FLUX_KONTEXT_TIERS.find((t) => t.value === slug);
  if (!tier) throw error(404, `Kontext tier "${slug ?? '(missing)'}" no existe`);
  return tier;
}

export const fluxKontextSubmit = (modelId: string) =>
  adaptSubmit(submitFluxKontext, modelId);

// Combina status + result en COMPLETED (mismo patrón que flux-pulid / flux-2-pro).
export const fluxKontextStatus = (modelId: string): RequestHandler => async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusFluxKontext(fal, modelId, requestId);
    if (status.status === 'COMPLETED') {
      const { result } = await resultFluxKontext(fal, modelId, requestId);
      return json({ status: 'COMPLETED', result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
