import type { RequestHandler } from './$types';
import { pixverseLipsyncSubmit } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseLipsyncSubmit('fal-ai/pixverse/lipsync');
