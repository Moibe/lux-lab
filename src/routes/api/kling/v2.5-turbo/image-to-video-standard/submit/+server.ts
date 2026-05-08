import type { RequestHandler } from './$types';
import { klingV25TurboI2VSubmit } from '$lib/api/kling-v2-5-turbo';

export const POST: RequestHandler = klingV25TurboI2VSubmit('fal-ai/kling-video/v2.5-turbo/standard/image-to-video', false);
