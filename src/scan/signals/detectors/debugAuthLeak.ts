import type { SignalId } from "../../../security/signals.js";

export type DebugAuthLeakSignalHit = {
  id: SignalId;
  evidence: string;
};

const RESPONSE_CALL_PATTERNS: RegExp[] = [
  /\bres\.status\([^)]*\)\.json\s*\(/i,
  /\bres\.json\s*\(/i,
  /\bres\.send\s*\(/i,
  /\bNextResponse\.json\s*\(/i,
  /\bnew\s+Response\s*\(/i
];

const DEBUG_ROUTE_PATTERN =
  /\b(?:router|app)\.(?:get|post|put|patch|delete|options|head)\s*\(\s*['"`][^'"`]*\bdebug\b[^'"`]*['"`]/i;
const DEBUG_FLAG_PATTERN = /\bdebug\s*:\s*true\b/i;
const DEBUG_FUNCTION_PATTERN =
  /\bfunction\s+([A-Za-z0-9_]*debug[A-Za-z0-9_]*)\s*\(|\bconst\s+([A-Za-z0-9_]*debug[A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/i;

const HEADERS_REF_PATTERN = /\b(?:req|request|ctx|context)\.headers\b/i;
const HEADER_ENTRY_PATTERN =
  /headers\.entries\(\)|Object\.fromEntries\([^)]*headers\.entries\(\)\)/i;
const ENV_REF_PATTERN = /\bprocess\.env\b|\bDeno\.env\b|\bimport\.meta\.env\b/i;

const MAX_WINDOW = 420;
const MAX_EVIDENCE_LENGTH = 140;

function buildEvidence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_EVIDENCE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_EVIDENCE_LENGTH - 3)}...`;
}

function firstMatch(patterns: RegExp[], content: string): string | null {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[0]) return buildEvidence(match[0]);
  }
  return null;
}

type ResponseContext = {
  headerEvidence: string | null;
  envEvidence: string | null;
  responseEvidence: string | null;
};

function findSensitiveResponseContext(content: string): ResponseContext | null {
  for (const pattern of RESPONSE_CALL_PATTERNS) {
    const match = content.match(pattern);
    if (!match || match.index === undefined) continue;
    const start = match.index;
    const window = content.slice(start, start + MAX_WINDOW);
    const headerEvidence = firstMatch([HEADERS_REF_PATTERN, HEADER_ENTRY_PATTERN], window);
    const envEvidence = firstMatch([ENV_REF_PATTERN], window);
    if (!headerEvidence && !envEvidence) continue;
    return {
      headerEvidence,
      envEvidence,
      responseEvidence: match[0] ? buildEvidence(match[0]) : null
    };
  }
  return null;
}

function findDebugEndpointEvidence(
  content: string,
  hasResponseContext: boolean
): string | null {
  const routeMatch = content.match(DEBUG_ROUTE_PATTERN);
  if (routeMatch?.[0]) return buildEvidence(routeMatch[0]);

  if (hasResponseContext) {
    const flagMatch = content.match(DEBUG_FLAG_PATTERN);
    if (flagMatch?.[0]) return buildEvidence(flagMatch[0]);
    const functionMatch = content.match(DEBUG_FUNCTION_PATTERN);
    if (functionMatch?.[0]) return buildEvidence(functionMatch[0]);
  }

  return null;
}

export function detectDebugAuthLeakSignals(content: string): DebugAuthLeakSignalHit[] {
  if (!content) return [];
  const hits: DebugAuthLeakSignalHit[] = [];
  const addHit = (id: SignalId, evidence: string) => {
    if (hits.some((entry) => entry.id === id)) return;
    hits.push({ id, evidence });
  };

  const responseContext = findSensitiveResponseContext(content);
  if (responseContext) {
    const evidence =
      responseContext.headerEvidence ??
      responseContext.envEvidence ??
      responseContext.responseEvidence ??
      "response includes headers or env values";
    addHit("logs_sensitive", evidence);
  }

  const debugEvidence = findDebugEndpointEvidence(content, Boolean(responseContext));
  if (debugEvidence) {
    addHit("debug_endpoint", debugEvidence);
  }

  return hits;
}
