import {
  klingV25TurboI2VSubmit as klingV25TurboI2VSubmitPure,
  klingV25TurboT2VSubmit as klingV25TurboT2VSubmitPure,
  klingV25TurboStatus as klingV25TurboStatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus, adaptSubmitWith } from '$lib/sk-adapter';

export const klingV25TurboI2VSubmit = (modelId: string, supportsTail: boolean) =>
  adaptSubmitWith(klingV25TurboI2VSubmitPure, modelId, supportsTail);
export const klingV25TurboT2VSubmit = (modelId: string) =>
  adaptSubmit(klingV25TurboT2VSubmitPure, modelId);
export const klingV25TurboStatus = (modelId: string) =>
  adaptStatus(klingV25TurboStatusPure, modelId);
