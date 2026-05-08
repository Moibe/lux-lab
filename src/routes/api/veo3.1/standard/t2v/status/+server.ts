import type { RequestHandler } from './$types';
import { veo31Status } from '$lib/api/veo3.1';

export const GET: RequestHandler = veo31Status('fal-ai/veo3.1');
