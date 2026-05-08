import type { RequestHandler } from './$types';
import { happyHorseR2VSubmit } from '$lib/api/happy-horse';

export const POST: RequestHandler = happyHorseR2VSubmit('alibaba/happy-horse/reference-to-video');
