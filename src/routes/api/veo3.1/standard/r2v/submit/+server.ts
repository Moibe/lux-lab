import type { RequestHandler } from './$types';
import { veo31R2VSubmit } from '$lib/api/veo3.1';

export const POST: RequestHandler = veo31R2VSubmit('fal-ai/veo3.1/reference-to-video');
