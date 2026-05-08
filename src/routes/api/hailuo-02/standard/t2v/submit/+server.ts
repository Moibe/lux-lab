import type { RequestHandler } from './$types';
import { hailuo02T2VSubmit } from '$lib/api/hailuo-02';

export const POST: RequestHandler = hailuo02T2VSubmit('fal-ai/minimax/hailuo-02/standard/text-to-video');
