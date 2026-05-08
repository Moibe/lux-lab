import {
  veo31T2VSubmit as veo31T2VSubmitPure,
  veo31I2VSubmit as veo31I2VSubmitPure,
  veo31R2VSubmit as veo31R2VSubmitPure,
  veo31FLFSubmit as veo31FLFSubmitPure,
  veo31Status as veo31StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const veo31T2VSubmit = (modelId: string) => adaptSubmit(veo31T2VSubmitPure, modelId);
export const veo31I2VSubmit = (modelId: string) => adaptSubmit(veo31I2VSubmitPure, modelId);
export const veo31R2VSubmit = (modelId: string) => adaptSubmit(veo31R2VSubmitPure, modelId);
export const veo31FLFSubmit = (modelId: string) => adaptSubmit(veo31FLFSubmitPure, modelId);
export const veo31Status = (modelId: string) => adaptStatus(veo31StatusPure, modelId);
