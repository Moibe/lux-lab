import type { RequestHandler } from './$types';
import { klingV26T2VSubmit } from '$lib/api/kling-v2-6';

export const POST: RequestHandler = klingV26T2VSubmit('fal-ai/kling-video/v2.6/pro/text-to-video');
