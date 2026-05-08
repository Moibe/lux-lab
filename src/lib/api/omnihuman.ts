import {
  submitOmnihuman as submitOmnihumanPure,
  statusOmnihuman as statusOmnihumanPure,
  resultOmnihuman as resultOmnihumanPure
} from '@moibe/falai-nucleo';
import { adaptSubmit, adaptStatus, adaptResult } from '$lib/sk-adapter';

export const submitOmnihuman = (modelId: string) => adaptSubmit(submitOmnihumanPure, modelId);
export const statusOmnihuman = (modelId: string) => adaptStatus(statusOmnihumanPure, modelId);
export const resultOmnihuman = (modelId: string) => adaptResult(resultOmnihumanPure, modelId);
