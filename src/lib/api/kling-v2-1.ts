import {
  klingV21I2VSubmit as klingV21I2VSubmitPure,
  klingV21T2VSubmit as klingV21T2VSubmitPure,
  klingV21Status as klingV21StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus, adaptSubmitWith } from '$lib/sk-adapter';

export const klingV21I2VSubmit = (modelId: string, supportsTail: boolean) =>
  adaptSubmitWith(klingV21I2VSubmitPure, modelId, supportsTail);
export const klingV21T2VSubmit = (modelId: string) => adaptSubmit(klingV21T2VSubmitPure, modelId);
export const klingV21Status = (modelId: string) => adaptStatus(klingV21StatusPure, modelId);
