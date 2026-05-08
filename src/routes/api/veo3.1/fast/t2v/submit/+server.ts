import type { RequestHandler } from './$types';
import { veo31T2VSubmit } from '$lib/api/veo3.1';

export const POST: RequestHandler = veo31T2VSubmit('fal-ai/veo3.1/fast');
