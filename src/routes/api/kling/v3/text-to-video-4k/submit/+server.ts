import type { RequestHandler } from './$types';
import { klingV3T2VSubmit } from '$lib/api/kling-v3';

export const POST: RequestHandler = klingV3T2VSubmit('fal-ai/kling-video/v3/4k/text-to-video');
