import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitNanoBanana2T2I,
  submitNanoBanana2Edit,
  statusNanoBanana2,
  resultNanoBanana2,
  NANO_BANANA_2_TIERS,
  NucleoError,
  type NanoBanana2TierMeta,
  type NanoBanana2T2IBody,
  type NanoBanana2EditBody
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

/**
 * Resuelve el tier de Nano Banana 2 desde un slug del URL. Lanza `error(404)`
 * si el slug no está en el allowlist.
 */
export function resolveNanoBanana2Tier(slug: string | undefined): NanoBanana2TierMeta {
  const tier = NANO_BANANA_2_TIERS.find((t) => t.value === slug);
  if (!tier) throw error(404, `Nano Banana 2 tier "${slug ?? '(missing)'}" no existe`);
  return tier;
}

export const nanoBanana2T2ISubmit = (modelId: string) =>
  adaptSubmit<NanoBanana2T2IBody>(submitNanoBanana2T2I, modelId);

export const nanoBanana2EditSubmit = (modelId: string) =>
  adaptSubmit<NanoBanana2EditBody>(submitNanoBanana2Edit, modelId);

// Combina status + result en COMPLETED (mismo patrón que flux-kontext / nano-banana v1).
export const nanoBanana2Status = (modelId: string): RequestHandler => async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusNanoBanana2(fal, modelId, requestId);
    if (status.status === 'COMPLETED') {
      const { result } = await resultNanoBanana2(fal, modelId, requestId);
      return json({ status: 'COMPLETED', result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
