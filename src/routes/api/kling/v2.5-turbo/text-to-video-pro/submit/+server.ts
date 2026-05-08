import type { RequestHandler } from './$types';
import { klingV25TurboT2VSubmit } from '$lib/api/kling-v2-5-turbo';

export const POST: RequestHandler = klingV25TurboT2VSubmit('fal-ai/kling-video/v2.5-turbo/pro/text-to-video');
