import type { RequestHandler } from './$types';
import { veo31FLFSubmit } from '$lib/api/veo3.1';

export const POST: RequestHandler = veo31FLFSubmit('fal-ai/veo3.1/first-last-frame-to-video');
