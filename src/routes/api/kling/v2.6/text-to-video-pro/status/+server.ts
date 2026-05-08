import type { RequestHandler } from './$types';
import { klingV26Status } from '$lib/api/kling-v2-6';

export const GET: RequestHandler = klingV26Status('fal-ai/kling-video/v2.6/pro/text-to-video');
