import type { RequestHandler } from './$types';
import { pixverseSwapSubmit } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseSwapSubmit('fal-ai/pixverse/swap');
