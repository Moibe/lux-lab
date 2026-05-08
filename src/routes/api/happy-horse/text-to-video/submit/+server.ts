import type { RequestHandler } from './$types';
import { happyHorseT2VSubmit } from '$lib/api/happy-horse';

export const POST: RequestHandler = happyHorseT2VSubmit('alibaba/happy-horse/text-to-video');
