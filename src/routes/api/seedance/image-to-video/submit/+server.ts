import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { fal } from '$lib/fal-server';
import { SEEDANCE_TIERS, type SeedanceTier } from '$lib/seedance-options';

function resolveModelId(tier: SeedanceTier): string {
  const meta = SEEDANCE_TIERS.find((t) => t.value === tier);
  if (!meta || !meta.endpoints.i2v) throw error(400, `tier inválida o no soporta i2v: ${tier}`);
  return meta.endpoints.i2v;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as Record<string, unknown> & { tier?: SeedanceTier };
  const tier = (body.tier as SeedanceTier) ?? '2.0';
  const modelId = resolveModelId(tier);
  const family = SEEDANCE_TIERS.find((t) => t.value === tier)!.family;

  if (!body.image_url) throw error(400, 'image_url requerido');

  const input: Record<string, unknown> = { image_url: body.image_url };
  const b = body as Record<string, unknown>;
  if (typeof b.prompt === 'string' && b.prompt.trim()) input.prompt = (b.prompt as string).trim();
  if (b.end_image_url) input.end_image_url = b.end_image_url;
  if (b.resolution) input.resolution = b.resolution;
  if (b.aspect_ratio) input.aspect_ratio = b.aspect_ratio;
  if (b.duration !== undefined) {
    input.duration = typeof b.duration === 'number' ? String(b.duration) : b.duration;
  }
  if (b.seed !== undefined) input.seed = b.seed;

  if (family === 'v2') {
    if (b.generate_audio !== undefined) input.generate_audio = b.generate_audio;
  } else {
    if (b.camera_fixed !== undefined) input.camera_fixed = b.camera_fixed;
    if (b.enable_safety_checker !== undefined) input.enable_safety_checker = b.enable_safety_checker;
    if (b.num_frames !== undefined) input.num_frames = b.num_frames;
  }

  const submission = await fal.queue.submit(modelId, { input });
  return json({ request_id: submission.request_id });
};
