import type { RequestHandler } from './$types';
import { statusOmnihuman } from '$lib/api/omnihuman';

export const GET: RequestHandler = statusOmnihuman('fal-ai/bytedance/omnihuman/v1.5');
