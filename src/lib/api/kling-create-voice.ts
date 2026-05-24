import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
  submitKlingCreateVoice,
  statusKlingCreateVoice,
  resultKlingCreateVoice,
  NucleoError
} from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';
import { adaptSubmit } from '$lib/sk-adapter';

export const KLING_CREATE_VOICE_MODEL = 'fal-ai/kling-video/create-voice';

export const klingCreateVoiceSubmit = adaptSubmit(
  submitKlingCreateVoice,
  KLING_CREATE_VOICE_MODEL
);

// Combina status + result en COMPLETED para que el polling de la UI obtenga el voice_id
// en la misma llamada (mismo patrón que wan/flux).
export const klingCreateVoiceStatus: RequestHandler = async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  try {
    const status = await statusKlingCreateVoice(fal, KLING_CREATE_VOICE_MODEL, requestId);
    if (status.status === 'COMPLETED') {
      const { voice_id, result } = await resultKlingCreateVoice(
        fal,
        KLING_CREATE_VOICE_MODEL,
        requestId
      );
      return json({ status: 'COMPLETED', voice_id, result, logs: status.logs });
    }
    return json(status);
  } catch (e) {
    if (e instanceof NucleoError) throw error(e.status, e.message);
    throw e;
  }
};
