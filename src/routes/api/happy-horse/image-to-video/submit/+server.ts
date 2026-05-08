import type { RequestHandler } from './$types';
import { happyHorseI2VSubmit } from '$lib/api/happy-horse';

export const POST: RequestHandler = happyHorseI2VSubmit('alibaba/happy-horse/image-to-video');
