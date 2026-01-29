import { cheapLlmModel, defaultLlmModel } from "./defaults.js";

export const DEFAULT_LLM_MODEL_OPENAI = defaultLlmModel("openai");
export const DEFAULT_LLM_MODEL_ANTHROPIC = defaultLlmModel("anthropic");
export const CHEAP_LLM_MODEL_OPENAI = cheapLlmModel("openai");
export const CHEAP_LLM_MODEL_ANTHROPIC = cheapLlmModel("anthropic");
export const CHEAP_MODE_ENV = "HADRIX_CHEAP_MODE";
const FAST_MODE_ENV = "HADRIX_FAST_MODE";

export function enableCheapMode(): void {
  process.env[CHEAP_MODE_ENV] = "1";
}

export function isCheapModeEnabled(): boolean {
  return process.env[CHEAP_MODE_ENV] === "1" || process.env[FAST_MODE_ENV] === "1";
}
