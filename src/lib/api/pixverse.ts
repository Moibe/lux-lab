import {
  pixverseI2VSubmit as pixverseI2VSubmitPure,
  pixverseT2VSubmit as pixverseT2VSubmitPure,
  pixverseTransitionSubmit as pixverseTransitionSubmitPure,
  pixverseExtendSubmit as pixverseExtendSubmitPure,
  pixverseR2VSubmit as pixverseR2VSubmitPure,
  pixverseEffectsSubmit as pixverseEffectsSubmitPure,
  pixverseSwapSubmit as pixverseSwapSubmitPure,
  pixverseLipsyncSubmit as pixverseLipsyncSubmitPure,
  pixverseStatus as pixverseStatusPure,
  type PixVerseCaps
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus, adaptSubmitWith } from '$lib/sk-adapter';

export { PIXVERSE_CAPS, PIXVERSE_VERSIONS, type PixVerseCaps } from '@moibe/falai-nucleo';

export const pixverseI2VSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseI2VSubmitPure, modelId, caps);
export const pixverseT2VSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseT2VSubmitPure, modelId, caps);
export const pixverseTransitionSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseTransitionSubmitPure, modelId, caps);
export const pixverseExtendSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseExtendSubmitPure, modelId, caps);
export const pixverseR2VSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseR2VSubmitPure, modelId, caps);
export const pixverseEffectsSubmit = (modelId: string, caps: PixVerseCaps) =>
  adaptSubmitWith(pixverseEffectsSubmitPure, modelId, caps);
export const pixverseSwapSubmit = (modelId: string) => adaptSubmit(pixverseSwapSubmitPure, modelId);
export const pixverseLipsyncSubmit = (modelId: string) =>
  adaptSubmit(pixverseLipsyncSubmitPure, modelId);
export const pixverseStatus = (modelId: string) => adaptStatus(pixverseStatusPure, modelId);
