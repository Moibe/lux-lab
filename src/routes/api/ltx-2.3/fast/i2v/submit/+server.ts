import type { RequestHandler } from './$types';
import { ltxI2VSubmit } from '$lib/api/ltx-2.3';

export const POST: RequestHandler = ltxI2VSubmit('fal-ai/ltx-2.3/image-to-video/fast');
