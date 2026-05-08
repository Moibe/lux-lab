import {
  happyHorseI2VSubmit as happyHorseI2VSubmitPure,
  happyHorseT2VSubmit as happyHorseT2VSubmitPure,
  happyHorseR2VSubmit as happyHorseR2VSubmitPure,
  happyHorseEditSubmit as happyHorseEditSubmitPure,
  happyHorseStatus as happyHorseStatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const happyHorseI2VSubmit = (modelId: string) => adaptSubmit(happyHorseI2VSubmitPure, modelId);
export const happyHorseT2VSubmit = (modelId: string) => adaptSubmit(happyHorseT2VSubmitPure, modelId);
export const happyHorseR2VSubmit = (modelId: string) => adaptSubmit(happyHorseR2VSubmitPure, modelId);
export const happyHorseEditSubmit = (modelId: string) => adaptSubmit(happyHorseEditSubmitPure, modelId);
export const happyHorseStatus = (modelId: string) => adaptStatus(happyHorseStatusPure, modelId);
