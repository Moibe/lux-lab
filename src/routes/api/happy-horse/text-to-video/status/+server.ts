import type { RequestHandler } from './$types';
import { happyHorseStatus } from '$lib/api/happy-horse';

export const GET: RequestHandler = happyHorseStatus('alibaba/happy-horse/text-to-video');
