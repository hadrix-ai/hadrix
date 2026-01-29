import { defaultLlmModel } from "./defaults.js";

export const DEFAULT_LLM_MODEL = defaultLlmModel("openai");
export const FAST_LLM_MODEL = "gpt-4o-mini";

export function enableFastMode(): void {
  process.env.HADRIX_LLM_PROVIDER = "openai";
  process.env.HADRIX_LLM_MODEL = FAST_LLM_MODEL;
}
