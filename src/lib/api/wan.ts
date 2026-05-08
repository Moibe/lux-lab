import {
  wanT2VSubmit as wanT2VSubmitPure,
  wanI2VSubmit as wanI2VSubmitPure,
  wanStatus as wanStatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const wanT2VSubmit = (modelId: string) => adaptSubmit(wanT2VSubmitPure, modelId);
export const wanI2VSubmit = (modelId: string) => adaptSubmit(wanI2VSubmitPure, modelId);
export const wanStatus = (modelId: string) => adaptStatus(wanStatusPure, modelId);
