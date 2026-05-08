import type { RequestHandler } from './$types';
import { ltxAudio2VSubmit } from '$lib/api/ltx-2.3';

export const POST: RequestHandler = ltxAudio2VSubmit('fal-ai/ltx-2.3/audio-to-video');
