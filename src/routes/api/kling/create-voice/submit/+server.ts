import type { RequestHandler } from '@sveltejs/kit';
import { klingCreateVoiceSubmit } from '$lib/api/kling-create-voice';

export const POST: RequestHandler = (event) => klingCreateVoiceSubmit(event);
