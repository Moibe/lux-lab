import type { RequestHandler } from './$types';
import { pixverseEffectsSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseEffectsSubmit('fal-ai/pixverse/v5/effects', PIXVERSE_CAPS['v5']);
