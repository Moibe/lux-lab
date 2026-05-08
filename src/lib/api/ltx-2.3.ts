import {
  ltxT2VSubmit as ltxT2VSubmitPure,
  ltxI2VSubmit as ltxI2VSubmitPure,
  ltxAudio2VSubmit as ltxAudio2VSubmitPure,
  ltxExtendSubmit as ltxExtendSubmitPure,
  ltxRetakeSubmit as ltxRetakeSubmitPure,
  ltxStatus as ltxStatusPure,
  ltxResult as ltxResultPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus, adaptResult } from '$lib/sk-adapter';

export const ltxT2VSubmit = (modelId: string) => adaptSubmit(ltxT2VSubmitPure, modelId);
export const ltxI2VSubmit = (modelId: string) => adaptSubmit(ltxI2VSubmitPure, modelId);
export const ltxAudio2VSubmit = (modelId: string) => adaptSubmit(ltxAudio2VSubmitPure, modelId);
export const ltxExtendSubmit = (modelId: string) => adaptSubmit(ltxExtendSubmitPure, modelId);
export const ltxRetakeSubmit = (modelId: string) => adaptSubmit(ltxRetakeSubmitPure, modelId);
export const ltxStatus = (modelId: string) => adaptStatus(ltxStatusPure, modelId);
export const ltxResult = (modelId: string) => adaptResult(ltxResultPure, modelId);
