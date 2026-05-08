import type { RequestHandler } from './$types';
import { pixverseTransitionSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseTransitionSubmit('fal-ai/pixverse/v4.5/transition', PIXVERSE_CAPS['v4.5']);
