import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { NucleoError, type FalClient } from '@moibe/falai-nucleo';
import { fal } from '$lib/fal-server';

// Re-throws NucleoError as a SvelteKit error so the framework can format the response.
function rethrow(e: unknown): never {
  if (e instanceof NucleoError) throw error(e.status, e.message);
  throw e;
}

export function adaptSubmit<B>(
  pure: (fal: FalClient, modelId: string, body: B) => Promise<unknown>,
  modelId: string
): RequestHandler {
  return async ({ request }) => {
    try {
      const body = (await request.json()) as B;
      const out = await pure(fal, modelId, body);
      return json(out as Parameters<typeof json>[0]);
    } catch (e) {
      rethrow(e);
    }
  };
}

export function adaptStatus(
  pure: (fal: FalClient, modelId: string, requestId: string) => Promise<unknown>,
  modelId: string
): RequestHandler {
  return async ({ url }) => {
    const requestId = url.searchParams.get('id');
    if (!requestId) throw error(400, 'query param "id" requerido');
    try {
      const out = await pure(fal, modelId, requestId);
      return json(out as Parameters<typeof json>[0]);
    } catch (e) {
      rethrow(e);
    }
  };
}

// For factories that take an extra config arg between modelId and body (e.g. supportsTail flag,
// PixVerse caps). Encoded as a single second positional argument.
export function adaptSubmitWith<B, C>(
  pure: (fal: FalClient, modelId: string, config: C, body: B) => Promise<unknown>,
  modelId: string,
  config: C
): RequestHandler {
  return async ({ request }) => {
    try {
      const body = (await request.json()) as B;
      const out = await pure(fal, modelId, config, body);
      return json(out as Parameters<typeof json>[0]);
    } catch (e) {
      rethrow(e);
    }
  };
}

export function adaptResult(
  pure: (fal: FalClient, modelId: string, requestId: string) => Promise<unknown>,
  modelId: string
): RequestHandler {
  return async ({ url }) => {
    const requestId = url.searchParams.get('id');
    if (!requestId) throw error(400, 'query param "id" requerido');
    try {
      const out = await pure(fal, modelId, requestId);
      return json(out as Parameters<typeof json>[0]);
    } catch (e) {
      rethrow(e);
    }
  };
}
