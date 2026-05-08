import type { RequestHandler } from './$types';
import { klingV3Status } from '$lib/api/kling-v3';

export const GET: RequestHandler = klingV3Status('fal-ai/kling-video/v3/pro/image-to-video');
