import type { RequestHandler } from './$types';
import { klingO3T2VSubmit } from '$lib/api/kling-o3';

export const POST: RequestHandler = klingO3T2VSubmit('fal-ai/kling-video/o3/4k/text-to-video');
