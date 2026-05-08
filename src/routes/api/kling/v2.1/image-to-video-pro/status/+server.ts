import type { RequestHandler } from './$types';
import { klingV21Status } from '$lib/api/kling-v2-1';

export const GET: RequestHandler = klingV21Status('fal-ai/kling-video/v2.1/pro/image-to-video');
