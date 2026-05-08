import type { RequestHandler } from './$types';
import { hailuo02I2VSubmit } from '$lib/api/hailuo-02';

export const POST: RequestHandler = hailuo02I2VSubmit('fal-ai/minimax/hailuo-02/standard/image-to-video');
