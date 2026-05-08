import type { RequestHandler } from './$types';
import { pixverseI2VSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseI2VSubmit('fal-ai/pixverse/c1/image-to-video', PIXVERSE_CAPS['c1']);
