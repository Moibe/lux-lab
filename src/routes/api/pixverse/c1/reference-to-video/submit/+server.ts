import type { RequestHandler } from './$types';
import { pixverseR2VSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseR2VSubmit('fal-ai/pixverse/c1/reference-to-video', PIXVERSE_CAPS['c1']);
