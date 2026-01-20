import type { HadrixConfig } from "../config/loadConfig.js";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: { message?: string };
}

function buildHeaders(config: HadrixConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.api.apiKey}`,
    ...config.api.headers
  };
}

export async function runChatCompletion(config: HadrixConfig, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(config.llm.endpoint, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: config.llm.temperature,
      max_tokens: config.llm.maxTokens
    })
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const message = payload.error?.message || `LLM request failed with status ${response.status}`;
    throw new Error(message);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response missing message content.");
  }

  return content;
}
