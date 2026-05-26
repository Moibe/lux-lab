import type { RequestHandler } from '@sveltejs/kit';
import { fluxPulidStatus } from '$lib/api/flux-pulid';

export const GET: RequestHandler = (event) => fluxPulidStatus(event);
