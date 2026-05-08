import type { RequestHandler } from './$types';
import { ltxT2VSubmit } from '$lib/api/ltx-2.3';

export const POST: RequestHandler = ltxT2VSubmit('fal-ai/ltx-2.3/text-to-video');
