import type { RequestHandler } from './$types';
import { resultOmnihuman } from '$lib/api/omnihuman';

export const GET: RequestHandler = resultOmnihuman('fal-ai/bytedance/omnihuman/v1.5');
