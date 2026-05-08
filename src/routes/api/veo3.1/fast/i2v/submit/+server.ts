import type { RequestHandler } from './$types';
import { veo31I2VSubmit } from '$lib/api/veo3.1';

export const POST: RequestHandler = veo31I2VSubmit('fal-ai/veo3.1/fast/image-to-video');
