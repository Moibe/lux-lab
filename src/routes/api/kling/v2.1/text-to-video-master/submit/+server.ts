import type { RequestHandler } from './$types';
import { klingV21T2VSubmit } from '$lib/api/kling-v2-1';

export const POST: RequestHandler = klingV21T2VSubmit('fal-ai/kling-video/v2.1/master/text-to-video');
