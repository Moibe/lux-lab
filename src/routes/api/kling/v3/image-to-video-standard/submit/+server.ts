import type { RequestHandler } from './$types';
import { klingV3I2VSubmit } from '$lib/api/kling-v3';

export const POST: RequestHandler = klingV3I2VSubmit('fal-ai/kling-video/v3/standard/image-to-video');
