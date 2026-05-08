import type { RequestHandler } from './$types';
import { submitOmnihuman } from '$lib/api/omnihuman';

export const POST: RequestHandler = submitOmnihuman('fal-ai/bytedance/omnihuman/v1.5');
