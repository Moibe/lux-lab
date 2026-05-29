import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitNanoBananaT2I,
  submitNanoBananaEdit,
  statusNanoBanana,
  resultNanoBanana,
  NANO_BANANA_TIERS,
  NucleoError,
  type NanoBananaTierMeta,
  type NanoBananaT2IBody,
  type NanoBananaEditBody
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

/**
 * Resuelve el tier de Nano Banana desde un slug del URL. Lanza `error(404)`
 * si el slug no está en el allowlist.
 */
export function resolveNanoBananaTier(slug: string | undefined): NanoBananaTierMeta {
  const tier = NANO_BANANA_TIERS.find((t) => t.value === slug);
  if (!tier) throw error(404, `Nano Banana tier "${slug ?? '(missing)'}" no existe`);
  return tier;
}

export const nanoBananaT2ISubmit = (modelId: string) =>
  adaptSubmit<NanoBananaT2IBody>(submitNanoBananaT2I, modelId);

export const nanoBananaEditSubmit = (modelId: string) =>
  adaptSubmit<NanoBananaEditBody>(submitNanoBananaEdit, modelId);

// Combina status + result en COMPLETED (mismo patrón que flux-kontext / flux-pulid).
export const nanoBananaStatus = (modelId: string): RequestHandler => async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusNanoBanana(fal, modelId, requestId);
    if (status.status === 'COMPLETED') {
      const { result } = await resultNanoBanana(fal, modelId, requestId);
      return json({ status: 'COMPLETED', result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
