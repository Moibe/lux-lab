import type { RequestHandler } from './$types';
import { pixverseStatus } from '$lib/api/pixverse';

export const GET: RequestHandler = pixverseStatus('fal-ai/pixverse/swap');
