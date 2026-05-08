import type { RequestHandler } from './$types';
import { klingO3R2VSubmit } from '$lib/api/kling-o3';

export const POST: RequestHandler = klingO3R2VSubmit('fal-ai/kling-video/o3/standard/reference-to-video');
