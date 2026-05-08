import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { fal } from '$lib/fal-server';
import { SEEDANCE_TIERS, type SeedanceTier } from '$lib/seedance-options';

export const GET: RequestHandler = async ({ url }) => {
  const requestId = url.searchParams.get('id');
  if (!requestId) throw error(400, 'query param "id" requerido');
  const tier = (url.searchParams.get('tier') as SeedanceTier) ?? '2.0';
  const meta = SEEDANCE_TIERS.find((t) => t.value === tier);
  if (!meta || !meta.endpoints.r2v) throw error(400, `tier inválida: ${tier}`);
  const modelId = meta.endpoints.r2v;

  const status = await fal.queue.status(modelId, { requestId, logs: true });
  if (status.status === 'COMPLETED') {
    const result = await fal.queue.result(modelId, { requestId });
    return json({
      status: 'COMPLETED',
      result: result.data,
      logs: 'logs' in status ? status.logs : []
    });
  }
  return json({ status: status.status, logs: 'logs' in status ? status.logs : [] });
};
