import type { RequestHandler } from './$types';
import { ltxExtendSubmit } from '$lib/api/ltx-2.3';

export const POST: RequestHandler = ltxExtendSubmit('fal-ai/ltx-2.3/extend-video');
