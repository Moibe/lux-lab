import type { RequestHandler } from './$types';
import { klingV25TurboStatus } from '$lib/api/kling-v2-5-turbo';

export const GET: RequestHandler = klingV25TurboStatus('fal-ai/kling-video/v2.5-turbo/standard/image-to-video');
