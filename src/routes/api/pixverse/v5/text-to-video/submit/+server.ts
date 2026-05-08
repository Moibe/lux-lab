import type { RequestHandler } from './$types';
import { pixverseT2VSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseT2VSubmit('fal-ai/pixverse/v5/text-to-video', PIXVERSE_CAPS['v5']);
