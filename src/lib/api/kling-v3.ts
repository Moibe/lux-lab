import {
  klingV3I2VSubmit as klingV3I2VSubmitPure,
  klingV3T2VSubmit as klingV3T2VSubmitPure,
  klingV3Status as klingV3StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const klingV3I2VSubmit = (modelId: string) => adaptSubmit(klingV3I2VSubmitPure, modelId);
export const klingV3T2VSubmit = (modelId: string) => adaptSubmit(klingV3T2VSubmitPure, modelId);
export const klingV3Status = (modelId: string) => adaptStatus(klingV3StatusPure, modelId);
