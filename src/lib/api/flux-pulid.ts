import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitFluxPulid,
  statusFluxPulid,
  resultFluxPulid,
  NucleoError
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

export const FLUX_PULID_MODEL = 'fal-ai/flux-pulid';

export const fluxPulidSubmit = adaptSubmit(submitFluxPulid, FLUX_PULID_MODEL);

// Combina status + result en COMPLETED (mismo patrón que flux-2-pro / wan).
export const fluxPulidStatus: RequestHandler = async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusFluxPulid(fal, FLUX_PULID_MODEL, requestId);
    if (status.status === 'COMPLETED') {
      const { result } = await resultFluxPulid(fal, FLUX_PULID_MODEL, requestId);
      return json({ status: 'COMPLETED', result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
