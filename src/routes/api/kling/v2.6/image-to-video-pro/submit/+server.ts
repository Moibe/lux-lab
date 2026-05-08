import type { RequestHandler } from './$types';
import { klingV26I2VSubmit } from '$lib/api/kling-v2-6';

export const POST: RequestHandler = klingV26I2VSubmit('fal-ai/kling-video/v2.6/pro/image-to-video');
