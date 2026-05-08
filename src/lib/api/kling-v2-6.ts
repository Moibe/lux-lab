import {
  klingV26I2VSubmit as klingV26I2VSubmitPure,
  klingV26T2VSubmit as klingV26T2VSubmitPure,
  klingV26Status as klingV26StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const klingV26I2VSubmit = (modelId: string) => adaptSubmit(klingV26I2VSubmitPure, modelId);
export const klingV26T2VSubmit = (modelId: string) => adaptSubmit(klingV26T2VSubmitPure, modelId);
export const klingV26Status = (modelId: string) => adaptStatus(klingV26StatusPure, modelId);
