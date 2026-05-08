import type { RequestHandler } from './$types';
import { hailuo02Status } from '$lib/api/hailuo-02';

export const GET: RequestHandler = hailuo02Status('fal-ai/minimax/hailuo-02/standard/image-to-video');
