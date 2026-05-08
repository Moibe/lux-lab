import { fal } from '@fal-ai/client';
import { FAL_KEY } from '$env/static/private';

fal.config({ credentials: FAL_KEY });

export { fal };
