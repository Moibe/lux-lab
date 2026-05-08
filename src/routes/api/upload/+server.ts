import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { fal } from '$lib/fal-server';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    throw error(400, 'No se recibió archivo (campo "file" requerido)');
  }

  const url = await fal.storage.upload(file);
  return json({ url });
};
