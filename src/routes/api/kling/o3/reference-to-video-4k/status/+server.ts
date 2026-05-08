import type { RequestHandler } from './$types';
import { klingO3Status } from '$lib/api/kling-o3';

export const GET: RequestHandler = klingO3Status('fal-ai/kling-video/o3/4k/reference-to-video');
