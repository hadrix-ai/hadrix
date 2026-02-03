import type { SignalId } from "../../../security/signals.js";

export type SignalHit = {
  id: SignalId;
  evidence: string;
};

const MAX_EVIDENCE_LENGTH = 140;
const ANON_KEY_NAME_SOURCE = "[A-Za-z0-9_]*anon[A-Za-z0-9_]*key[A-Za-z0-9_]*";
const ANON_KEY_ENV_PATTERN =
  /\bSUPABASE_ANON_KEY\b|\bNEXT_PUBLIC_SUPABASE_ANON_KEY\b|\bVITE_SUPABASE_ANON_KEY\b|\bNUXT_PUBLIC_SUPABASE_ANON_KEY\b/i;
const ANON_KEY_NAME_PATTERN = new RegExp(`\\b${ANON_KEY_NAME_SOURCE}\\b`, "i");
const PUBLIC_API_KEY_PATTERN = new RegExp(
  `${ANON_KEY_ENV_PATTERN.source}|\\b${ANON_KEY_NAME_SOURCE}\\b`,
  "i"
);
const SUPABASE_ANON_HELPER_PATTERN = /\bsupabaseAnon\b/i;
const SUPABASE_CLIENT_USAGE_PATTERN =
  /\bcreateClient\s*\(|\bfrom\(\s*["'`][^"'`]+["'`]\s*\)/i;
const AUTHORIZATION_BEARER_CAPTURE_PATTERNS: RegExp[] = [
  /authorization\s*:\s*`Bearer\s*\$\{\s*([^}]+)\s*\}`/gi,
  /authorization\s*:\s*['"]Bearer\s+['"]\s*\+\s*([^\n,}]+)/gi,
  /headers\.(?:set|append)\(\s*['"]authorization['"]\s*,\s*`Bearer\s*\$\{\s*([^}]+)\s*\}`\s*\)/gi,
  /headers\.(?:set|append)\(\s*['"]authorization['"]\s*,\s*['"]Bearer\s+['"]\s*\+\s*([^)]+)\)/gi
];
const AUTH_HEADER_PATTERN = /\bauthorization\b/i;
const BEARER_TOKEN_PATTERN = /\bbearer\b/i;

function buildEvidence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_EVIDENCE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_EVIDENCE_LENGTH - 3)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTokenExpression(match: RegExpMatchArray): string {
  for (let i = match.length - 1; i >= 1; i -= 1) {
    const part = match[i];
    if (typeof part === "string" && part.trim()) {
      return part.trim();
    }
  }
  return "";
}

function extractIdentifier(value: string): string | null {
  if (!value) return null;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : null;
}

function findBearerEvidence(content: string): string | null {
  for (const pattern of AUTHORIZATION_BEARER_CAPTURE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const tokenExpr = extractTokenExpression(match);
      const matchText = match[0] ?? "";
      if (!tokenExpr && !matchText) continue;

      if (PUBLIC_API_KEY_PATTERN.test(matchText) || PUBLIC_API_KEY_PATTERN.test(tokenExpr)) {
        return buildEvidence(matchText || tokenExpr);
      }

      const tokenVar = extractIdentifier(tokenExpr);
      if (!tokenVar) continue;
      const assignPattern = new RegExp(
        `\\b${escapeRegExp(tokenVar)}\\b\\s*=\\s*[\\s\\S]{0,220}?(${PUBLIC_API_KEY_PATTERN.source})`,
        "i"
      );
      if (assignPattern.test(content)) {
        return buildEvidence(matchText || tokenExpr);
      }
    }
  }
  return null;
}

export function detectPublicApiKeySignals(content: string): SignalHit[] {
  if (!content) return [];
  const hits: SignalHit[] = [];
  const seen = new Set<SignalId>();
  const addHit = (id: SignalId, evidence: string) => {
    if (seen.has(id)) return;
    hits.push({ id, evidence });
    seen.add(id);
  };

  const anonMatch = content.match(PUBLIC_API_KEY_PATTERN);
  const anonEvidence = anonMatch?.[0];
  const hasBearerHeader = AUTH_HEADER_PATTERN.test(content) && BEARER_TOKEN_PATTERN.test(content);
  const hasClientUsage = SUPABASE_CLIENT_USAGE_PATTERN.test(content);
  const hasSupabaseAnonHelper = SUPABASE_ANON_HELPER_PATTERN.test(content);
  const bearerEvidence = findBearerEvidence(content);

  if (bearerEvidence) {
    addHit("public_api_key_bearer", bearerEvidence);
    addHit("public_api_key_usage", bearerEvidence);
  }

  if (!seen.has("public_api_key_usage")) {
    if (anonEvidence && (hasClientUsage || hasBearerHeader)) {
      addHit("public_api_key_usage", buildEvidence(anonEvidence));
    } else if (hasSupabaseAnonHelper && hasClientUsage) {
      addHit("public_api_key_usage", "supabaseAnon helper used with client initialization");
    } else if (ANON_KEY_NAME_PATTERN.test(content) && hasBearerHeader) {
      addHit("public_api_key_usage", "anon key identifier used with bearer auth header");
    }
  }

  return hits;
}
