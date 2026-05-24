import type { RequestHandler } from '@sveltejs/kit';
import { klingCreateVoiceStatus } from '$lib/api/kling-create-voice';

export const GET: RequestHandler = (event) => klingCreateVoiceStatus(event);
