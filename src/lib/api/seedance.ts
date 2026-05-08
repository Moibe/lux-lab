import {
  seedanceI2VSubmit as seedanceI2VSubmitPure,
  seedanceT2VSubmit as seedanceT2VSubmitPure,
  seedanceR2VSubmit as seedanceR2VSubmitPure,
  seedanceStatus as seedanceStatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const seedanceI2VSubmit = (modelId: string) => adaptSubmit(seedanceI2VSubmitPure, modelId);
export const seedanceT2VSubmit = (modelId: string) => adaptSubmit(seedanceT2VSubmitPure, modelId);
export const seedanceR2VSubmit = (modelId: string) => adaptSubmit(seedanceR2VSubmitPure, modelId);
export const seedanceStatus = (modelId: string) => adaptStatus(seedanceStatusPure, modelId);
