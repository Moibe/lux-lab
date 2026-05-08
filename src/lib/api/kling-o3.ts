import {
  klingO3I2VSubmit as klingO3I2VSubmitPure,
  klingO3T2VSubmit as klingO3T2VSubmitPure,
  klingO3R2VSubmit as klingO3R2VSubmitPure,
  klingO3EditSubmit as klingO3EditSubmitPure,
  klingO3Status as klingO3StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const klingO3I2VSubmit = (modelId: string) => adaptSubmit(klingO3I2VSubmitPure, modelId);
export const klingO3T2VSubmit = (modelId: string) => adaptSubmit(klingO3T2VSubmitPure, modelId);
export const klingO3R2VSubmit = (modelId: string) => adaptSubmit(klingO3R2VSubmitPure, modelId);
export const klingO3EditSubmit = (modelId: string) => adaptSubmit(klingO3EditSubmitPure, modelId);
export const klingO3Status = (modelId: string) => adaptStatus(klingO3StatusPure, modelId);
