import type { RequestHandler } from './$types';
import { ltxRetakeSubmit } from '$lib/api/ltx-2.3';

export const POST: RequestHandler = ltxRetakeSubmit('fal-ai/ltx-2.3/retake-video');
