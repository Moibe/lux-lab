import type { RequestHandler } from './$types';
import { pixverseTransitionSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseTransitionSubmit('fal-ai/pixverse/c1/transition', PIXVERSE_CAPS['c1']);
