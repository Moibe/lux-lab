import { error, type RequestHandler } from '@sveltejs/kit';
import { wanStatus } from '$lib/api/wan';
import { getWanModel, WAN_MODELS } from '$lib/wan-options';

export const GET: RequestHandler = async (event) => {
  const slug = event.params.model!;
  if (!WAN_MODELS.some((m) => m.slug === slug)) throw error(404, `Wan model "${slug}" no existe`);
  const m = getWanModel(slug);
  if (!m.t2vModelId) throw error(404, `Wan model "${slug}" no soporta text-to-video`);
  return wanStatus(m.t2vModelId)(event);
};
