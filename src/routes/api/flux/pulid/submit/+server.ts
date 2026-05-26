import type { RequestHandler } from '@sveltejs/kit';
import { fluxPulidSubmit } from '$lib/api/flux-pulid';

export const POST: RequestHandler = (event) => fluxPulidSubmit(event);
