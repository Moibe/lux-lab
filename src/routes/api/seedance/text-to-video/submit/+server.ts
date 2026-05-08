import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { fal } from '$lib/fal-server';
import { SEEDANCE_TIERS, type SeedanceTier } from '$lib/seedance-options';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as Record<string, unknown> & { tier?: SeedanceTier };
  const tier = (body.tier as SeedanceTier) ?? '2.0';
  const meta = SEEDANCE_TIERS.find((t) => t.value === tier);
  if (!meta || !meta.endpoints.t2v) throw error(400, `tier inválida o no soporta t2v: ${tier}`);
  const modelId = meta.endpoints.t2v;

  const b = body as Record<string, unknown>;
  if (typeof b.prompt !== 'string' || !(b.prompt as string).trim()) throw error(400, 'prompt requerido');

  const input: Record<string, unknown> = { prompt: (b.prompt as string).trim() };
  if (b.resolution) input.resolution = b.resolution;
  if (b.aspect_ratio) input.aspect_ratio = b.aspect_ratio;
  if (b.duration !== undefined) {
    input.duration = typeof b.duration === 'number' ? String(b.duration) : b.duration;
  }
  if (b.seed !== undefined) input.seed = b.seed;

  if (meta.family === 'v2') {
    if (b.generate_audio !== undefined) input.generate_audio = b.generate_audio;
  } else {
    if (b.camera_fixed !== undefined) input.camera_fixed = b.camera_fixed;
    if (b.enable_safety_checker !== undefined) input.enable_safety_checker = b.enable_safety_checker;
    if (b.num_frames !== undefined) input.num_frames = b.num_frames;
  }

  const submission = await fal.queue.submit(modelId, { input });
  return json({ request_id: submission.request_id });
};
