import type { RequestHandler } from './$types';
import { ltxResult } from '$lib/api/ltx-2.3';

export const GET: RequestHandler = ltxResult('fal-ai/ltx-2.3/image-to-video');
