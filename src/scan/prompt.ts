import crypto from "node:crypto";
import type { Finding, Severity } from "../types.js";
import type { ChatMessage } from "../providers/llm.js";

export interface PromptChunk {
  id: string;
  filepath: string;
  startLine: number;
  endLine: number;
  content: string;
}

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeSeverity(value: string | undefined): Severity {
  const normalized = (value || "").toLowerCase();
  if (SEVERITIES.includes(normalized as Severity)) {
    return normalized as Severity;
  }
  return "low";
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text.trim();
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    const next = input[i + 1] ?? "";
    if (!inString && char === "/" && next === "/") {
      i += 1;
      while (i + 1 < input.length && input[i + 1] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (!inString && char === "/" && next === "*") {
      i += 1;
      while (i + 1 < input.length) {
        if (input[i] === "*" && input[i + 1] === "/") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    output += char;
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
    }
  }
  return output;
}

export function buildScanMessages(chunks: PromptChunk[], staticFindingsSummary?: string): ChatMessage[] {
  const system = [
    "You are a security code reviewer.",
    "Use only the provided code chunks as evidence.",
    "If the chunks are insufficient to support a finding, return an empty JSON array [].",
    "Output must be a strict JSON array of findings with no extra text."
  ].join(" ");

  const instructions = [
    "Analyze the following code chunks for security risks.",
    "Only cite evidence from the chunks.",
    "You are also given existing static scanner findings; do not repeat them.",
    "Return JSON array of findings with fields:",
    "title, severity (low|medium|high|critical), description,",
    "location { filepath, startLine, endLine }, evidence, remediation, chunkId."
  ].join(" ");

  const chunkLines = chunks
    .map((chunk) => {
      return [
        `Chunk ${chunk.id}`,
        `File: ${chunk.filepath}:${chunk.startLine}-${chunk.endLine}`,
        "```",
        chunk.content,
        "```"
      ].join("\n");
    })
    .join("\n\n");

  const staticSection = staticFindingsSummary
    ? `\n\nStatic findings summary:\n${staticFindingsSummary}`
    : "";

  return [
    { role: "system", content: system },
    { role: "user", content: `${instructions}${staticSection}\n\n${chunkLines}` }
  ];
}

export function parseFindings(raw: string, chunkMap: Map<string, PromptChunk>): Finding[] {
  const jsonText = extractJson(raw);
  let data: unknown;
  try {
    data = JSON.parse(stripJsonComments(jsonText));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM returned invalid JSON: ${message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("LLM response was not a JSON array.");
  }

  const findings: Finding[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const chunkId = typeof record.chunkId === "string" ? record.chunkId : null;
    if (!chunkId || !chunkMap.has(chunkId)) continue;
    const chunk = chunkMap.get(chunkId)!;
    const location = (record.location || {}) as Record<string, unknown>;
    const filepath =
      typeof location.filepath === "string" ? location.filepath : chunk.filepath;
    const startLine =
      typeof location.startLine === "number" ? location.startLine : chunk.startLine;
    const endLine =
      typeof location.endLine === "number" ? location.endLine : chunk.endLine;

    const title = typeof record.title === "string" ? record.title.trim() : "Untitled finding";
    const description =
      typeof record.description === "string" ? record.description.trim() : "";
    const evidence = typeof record.evidence === "string" ? record.evidence.trim() : undefined;
    const remediation =
      typeof record.remediation === "string" ? record.remediation.trim() : undefined;

    const severity = normalizeSeverity(
      typeof record.severity === "string" ? record.severity : undefined
    );

    findings.push({
      id: sha256(`${title}:${filepath}:${startLine}:${endLine}:${chunkId}`),
      title,
      severity,
      description,
      location: {
        filepath,
        startLine,
        endLine
      },
      evidence,
      remediation,
      source: "llm",
      chunkId
    });
  }

  return findings;
}
