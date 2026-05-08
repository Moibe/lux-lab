import type { RequestHandler } from './$types';
import { pixverseExtendSubmit, PIXVERSE_CAPS } from '$lib/api/pixverse';

export const POST: RequestHandler = pixverseExtendSubmit('fal-ai/pixverse/v6/extend', PIXVERSE_CAPS['v6']);
