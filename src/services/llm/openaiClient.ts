import OpenAI from "openai";

import type { ChatMessage, LlmAdapterInput, LlmAdapterResult, LlmAdapterUsage } from "./llm.js";

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

type OpenAiResponseShape = {
  output_text?: string | null;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string | null;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

type SdkResponseWrapper<T> = {
  withResponse?: () => Promise<{ data: T; response: Response }>;
  asResponse?: () => Promise<Response>;
};

const buildResponsesInput = (messages: ChatMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }]
  }));

const shouldIncludeTemperature = (model: string): boolean => {
  const lowered = model.toLowerCase();
  return !lowered.startsWith("gpt-5");
};

const buildReasoning = (
  model: string,
  reasoningEnabled?: boolean
): { effort: "medium" | "high" } | undefined => {
  if (reasoningEnabled !== true) return undefined;
  const lowered = model.toLowerCase();
  if (!lowered.startsWith("gpt-5")) return undefined;
  if (lowered.includes("mini") || lowered.includes("nano")) {
    return { effort: "medium" };
  }
  return { effort: "high" };
};

const normalizeUsageCount = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
};

const extractUsage = (response: OpenAiResponseShape): LlmAdapterUsage | undefined => {
  const usage = response.usage;
  if (!usage) return undefined;
  const inputTokens = normalizeUsageCount(usage.input_tokens);
  const outputTokens = normalizeUsageCount(usage.output_tokens);
  const totalTokens = normalizeUsageCount(usage.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens
  };
};

const extractOutputText = (response: OpenAiResponseShape): string | null => {
  const direct = typeof response.output_text === "string" ? response.output_text : "";
  if (direct.trim()) return direct;
  const fallback =
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("") ?? "";
  if (fallback.trim()) return fallback;
  return null;
};

const unwrapSdkResponse = async <T>(promise: Promise<T>): Promise<{ data: T; response?: Response }> => {
  const wrapper = promise as unknown as SdkResponseWrapper<T>;
  if (typeof wrapper.withResponse === "function") {
    return wrapper.withResponse();
  }
  if (typeof wrapper.asResponse === "function") {
    const response = await wrapper.asResponse();
    const data = (await response.clone().json()) as T;
    return { data, response };
  }
  return { data: await promise };
};

export async function runOpenAiAdapter(
  input: LlmAdapterInput,
  options: OpenAiAdapterOptions
): Promise<LlmAdapterResult> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
    defaultHeaders: options.defaultHeaders
  });

  const request: Record<string, unknown> = {
    model: input.model,
    input: buildResponsesInput(input.messages),
    max_output_tokens: input.maxTokens,
    text: { format: { type: "text" } }
  };
  const reasoning = buildReasoning(input.model, input.reasoning);
  if (reasoning) {
    request.reasoning = reasoning;
  }
  if (shouldIncludeTemperature(input.model) && Number.isFinite(input.temperature)) {
    request.temperature = input.temperature;
  }

  const responsePromise = client.responses.create(request);

  const { data, response: rawResponse } = await unwrapSdkResponse(responsePromise);
  const responseShape = data as OpenAiResponseShape;
  const text = extractOutputText(responseShape);
  if (!text) {
    const preview = JSON.stringify(responseShape).slice(0, 2000);
    throw new Error(`OpenAI response missing output text. Response preview: ${preview}`);
  }

  return {
    text,
    usage: extractUsage(responseShape),
    raw: data,
    response: rawResponse
  };
}
