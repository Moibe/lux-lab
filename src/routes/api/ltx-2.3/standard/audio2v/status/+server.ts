import type { RequestHandler } from './$types';
import { ltxStatus } from '$lib/api/ltx-2.3';

export const GET: RequestHandler = ltxStatus('fal-ai/ltx-2.3/audio-to-video');
