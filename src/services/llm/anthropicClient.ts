import Anthropic from "@anthropic-ai/sdk";

import type { ChatMessage, LlmAdapterInput, LlmAdapterResult, LlmAdapterUsage } from "./llm.js";

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

type AnthropicResponseShape = {
  content?: Array<{
    type?: string;
    text?: string | null;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

type SdkResponseWrapper<T> = {
  withResponse?: () => Promise<{ data: T; response: Response }>;
  asResponse?: () => Promise<Response>;
};

type NonSystemChatMessage = ChatMessage & { role: Exclude<ChatMessage["role"], "system"> };

const splitSystemMessages = (
  messages: ChatMessage[]
): { system: string; rest: NonSystemChatMessage[] } => {
  const systemParts: string[] = [];
  const rest: NonSystemChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      rest.push(message);
    }
  }
  return { system: systemParts.join("\n"), rest };
};

const normalizeUsageCount = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
};

const extractUsage = (response: AnthropicResponseShape): LlmAdapterUsage | undefined => {
  const usage = response.usage;
  if (!usage) return undefined;
  const inputTokens = normalizeUsageCount(usage.input_tokens);
  const outputTokens = normalizeUsageCount(usage.output_tokens);
  const cacheCreateTokens = normalizeUsageCount(usage.cache_creation_input_tokens);
  const cacheReadTokens = normalizeUsageCount(usage.cache_read_input_tokens);
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheCreateTokens === undefined &&
    cacheReadTokens === undefined
  ) {
    return undefined;
  }
  const totalTokens =
    (inputTokens ?? 0) +
    (outputTokens ?? 0) +
    (cacheCreateTokens ?? 0) +
    (cacheReadTokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens
  };
};

const extractOutputText = (response: AnthropicResponseShape): string | null => {
  const text =
    response.content
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("") ?? "";
  if (text.trim()) return text;
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

export async function runAnthropicAdapter(
  input: LlmAdapterInput,
  options: AnthropicAdapterOptions
): Promise<LlmAdapterResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
    defaultHeaders: options.defaultHeaders
  });

  const { system, rest } = splitSystemMessages(input.messages);

  const responsePromise = client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    system: system.trim() ? system : undefined,
    messages: rest.map((message) => ({
      role: message.role,
      content: message.content
    }))
  });

  const { data, response: rawResponse } = await unwrapSdkResponse(responsePromise);
  const responseShape = data as AnthropicResponseShape;
  const text = extractOutputText(responseShape);
  if (!text) {
    const preview = JSON.stringify(responseShape).slice(0, 2000);
    throw new Error(`Anthropic response missing output text. Response preview: ${preview}`);
  }

  return {
    text,
    usage: extractUsage(responseShape),
    raw: data,
    response: rawResponse
  };
}
