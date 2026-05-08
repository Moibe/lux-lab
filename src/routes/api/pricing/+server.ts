import { pricingHandler } from '$lib/api/pricing';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = pricingHandler;
