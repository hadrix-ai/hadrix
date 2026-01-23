import type { SummaryComparator, SummaryComparison } from "./types.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 60000;
const FALLBACK_THRESHOLD = 0.45;

const readEnv = (name: string): string => {
  const value = process.env[name];
  return value ? value.trim() : "";
};

const resolveOpenAiApiKey = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const explicit = readEnv("HADRIX_LLM_API_KEY") || readEnv("OPENAI_API_KEY");
  if (explicit) return explicit;
  const provider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (provider === "openai") {
    const fallback = readEnv("HADRIX_API_KEY");
    if (fallback) return fallback;
  }
  return "";
};

const resolveOpenAiBaseUrl = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const explicit = readEnv("HADRIX_LLM_BASE") || readEnv("OPENAI_API_BASE");
  if (explicit) return explicit;
  const provider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (provider === "openai") {
    const fallback = readEnv("HADRIX_API_BASE");
    if (fallback) return fallback;
  }
  return "https://api.openai.com";
};

const resolveModel = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const llmProvider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (llmProvider === "openai") {
    const llmModel = readEnv("HADRIX_LLM_MODEL");
    if (llmModel) return llmModel;
  }
  return DEFAULT_MODEL;
};

const safeJsonParse = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenSet = (value: string): Set<string> => {
  const tokens = normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  return new Set(tokens);
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export function createOpenAiSummaryComparator(options?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}): SummaryComparator {
  const apiKey = resolveOpenAiApiKey(options?.apiKey);
  if (!apiKey) {
    throw new Error(
      "Missing OpenAI API key for eval comparator. Set HADRIX_EVALS_OPENAI_API_KEY or OPENAI_API_KEY."
    );
  }
  const baseUrl = resolveOpenAiBaseUrl(options?.baseUrl).replace(/\/+$/, "");
  const model = resolveModel(options?.model);
  const timeoutMs = options?.timeoutMs && Number.isFinite(options.timeoutMs)
    ? Math.max(1000, Math.trunc(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const supportsTemperature = !model.toLowerCase().startsWith("gpt-5-");

  return async ({ expected, actual }): Promise<SummaryComparison> => {
    const fallback = (): SummaryComparison => {
      const score = jaccard(tokenSet(expected.expectation), tokenSet(actual.summary));
      return {
        match: score >= FALLBACK_THRESHOLD,
        score,
        rationale: "token_jaccard_fallback",
      };
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          ...(supportsTemperature ? { temperature: 0 } : {}),
          messages: [
            {
              role: "system",
              content: [
                "You are an evaluation judge for security scan results.",
                "Determine whether an actual finding summary matches an expected security issue/fix description.",
                "The expected expectation and actual summary may not precisely match but should describe the same security issue.",
                "Even if the expected and actual summary do not match exactly, if they describe the same security issue, the match should be true.",
                "The expected text may describe the issue, the fix, or both.",
                "Return ONLY valid JSON with keys: match (boolean), score (0-1 number), rationale (string).",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                expected: {
                  id: expected.id ?? null,
                  filepath: expected.filepath,
                  expectation: expected.expectation,
                  severity: expected.severity ?? null,
                  source: expected.source ?? null,
                  ruleId: expected.ruleId ?? null,
                },
                actual: {
                  id: actual.id,
                  summary: actual.summary,
                  severity: actual.severity ?? null,
                  source: actual.source ?? null,
                  location: actual.location ?? null,
                  details: {
                    ruleId:
                      typeof actual.details?.ruleId === "string"
                        ? actual.details.ruleId
                        : null,
                    tool:
                      typeof actual.details?.tool === "string"
                        ? actual.details.tool
                        : null,
                  },
                },
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!response.ok) {
        const message = payload.error?.message || `OpenAI request failed with status ${response.status}`;
        throw new Error(message);
      }

      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = safeJsonParse(content);
      if (!parsed) {
        return fallback();
      }

      const match = parsed.match === true;
      const scoreRaw = parsed.score;
      const score =
        typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
          ? Math.max(0, Math.min(1, scoreRaw))
          : 0;
      const rationale =
        typeof parsed.rationale === "string"
          ? parsed.rationale
          : "openai_no_rationale";

      return { match, score, rationale };
    } catch {
      return fallback();
    } finally {
      clearTimeout(timeout);
    }
  };
}
