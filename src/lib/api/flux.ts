import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitFlux2Pro,
  statusFlux2Pro,
  resultFlux2Pro,
  NucleoError
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

export const flux2ProSubmit = (modelId: string) => adaptSubmit(submitFlux2Pro, modelId);

// Combina status + result en COMPLETED (igual que wanStatus), para mantener el mismo
// patrón de polling en la UI: un solo endpoint devuelve el resultado al completarse.
export const flux2ProStatus = (modelId: string): RequestHandler => async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusFlux2Pro(fal, modelId, requestId);
    if (status.status === 'COMPLETED') {
      const { result } = await resultFlux2Pro(fal, modelId, requestId);
      return json({ status: 'COMPLETED', result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
