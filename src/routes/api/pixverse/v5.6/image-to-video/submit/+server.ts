import type { RequestHandler } from './$types';
import { pixverseI2VSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseI2VSubmit('fal-ai/pixverse/v5.6/image-to-video', PIXVERSE_CAPS['v5.6']);
