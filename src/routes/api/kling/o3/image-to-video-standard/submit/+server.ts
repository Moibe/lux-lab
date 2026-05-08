import type { RequestHandler } from './$types';
import { klingO3I2VSubmit } from '$lib/api/kling-o3';

export const POST: RequestHandler = klingO3I2VSubmit('fal-ai/kling-video/o3/standard/image-to-video');
