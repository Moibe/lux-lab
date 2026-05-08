import type { RequestHandler } from './$types';
import { klingO3EditSubmit } from '$lib/api/kling-o3';

export const POST: RequestHandler = klingO3EditSubmit('fal-ai/kling-video/o3/pro/video-to-video/edit');
