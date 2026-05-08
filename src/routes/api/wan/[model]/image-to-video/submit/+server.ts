import { error, type RequestHandler } from '@sveltejs/kit';
import { wanI2VSubmit } from '$lib/api/wan';
import { getWanModel, WAN_MODELS } from '$lib/wan-options';

export const POST: RequestHandler = async (event) => {
  const slug = event.params.model!;
  if (!WAN_MODELS.some((m) => m.slug === slug)) throw error(404, `Wan model "${slug}" no existe`);
  const m = getWanModel(slug);
  if (!m.i2vModelId) throw error(404, `Wan model "${slug}" no soporta image-to-video`);
  return wanI2VSubmit(m.i2vModelId)(event);
};
