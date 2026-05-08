import {
  hailuo02I2VSubmit as hailuo02I2VSubmitPure,
  hailuo02T2VSubmit as hailuo02T2VSubmitPure,
  hailuo02Status as hailuo02StatusPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus } from '$lib/sk-adapter';

export const hailuo02I2VSubmit = (modelId: string) => adaptSubmit(hailuo02I2VSubmitPure, modelId);
export const hailuo02T2VSubmit = (modelId: string) => adaptSubmit(hailuo02T2VSubmitPure, modelId);
export const hailuo02Status = (modelId: string) => adaptStatus(hailuo02StatusPure, modelId);
