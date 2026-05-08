import type { RequestHandler } from './$types';
import { klingV21I2VSubmit } from '$lib/api/kling-v2-1';

export const POST: RequestHandler = klingV21I2VSubmit('fal-ai/kling-video/v2.1/master/image-to-video', false);
