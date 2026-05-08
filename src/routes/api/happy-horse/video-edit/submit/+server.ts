import type { RequestHandler } from './$types';
import { happyHorseEditSubmit } from '$lib/api/happy-horse';

export const POST: RequestHandler = happyHorseEditSubmit('alibaba/happy-horse/video-edit');
