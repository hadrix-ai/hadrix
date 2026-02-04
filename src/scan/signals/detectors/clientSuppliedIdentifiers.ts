export type ClientSuppliedIdentifierSignals = {
  hasId: boolean;
  hasUserId: boolean;
  hasOrgId: boolean;
  hasPathOrQueryId: boolean;
  evidence: {
    id?: string;
    userId?: string;
    orgId?: string;
    pathOrQuery?: string;
  };
};

const REQUEST_PROP_PATTERN = /\breq\.(params|query)\??\.([A-Za-z0-9_]+)\b/g;
const REQUEST_BRACKET_PATTERN =
  /\breq\.(params|query)\s*\[\s*["']([A-Za-z0-9_]+)["']\s*\]/g;
const REQUEST_PARAM_CALL_PATTERN = /\breq\.param\s*\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
const REQUEST_QUERY_GET_PATTERN = /\breq\.query\.get\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
const SEARCH_PARAM_CAPTURE_PATTERN =
  /searchParams\.get\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
const REQUEST_DESTRUCTURE_PATTERN =
  /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.(params|query)\b/g;

const USER_ID_NORMALIZED_PATTERNS = [
  /^userid$/,
  /^uid$/,
  /^email$/,
  /^(user|member|owner|customer|admin)id$/
];

const ORG_ID_NORMALIZED_PATTERNS = [/^(org|tenant|team|workspace|company|group)id$/];

const GENERIC_ID_RAW_PATTERNS = [
  /(?:^|[_-])id$/i,
  /Id$/,
  /(?:^|[_-])(uuid|guid)$/i,
  /(Uuid|Guid)$/
];

function matchesAny(patterns: RegExp[], value: string): boolean {
  for (const pattern of patterns) {
    if (pattern.test(value)) return true;
  }
  return false;
}

function normalizeParamName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function extractDestructuredNames(list: string): string[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => {
      if (!entry || entry.startsWith("...")) return "";
      const withoutDefault = entry.replace(/=.*/, "").trim();
      const base = withoutDefault.split(":")[0]?.trim() ?? "";
      const match = base.match(/[A-Za-z0-9_]+/);
      return match ? match[0] : "";
    })
    .filter(Boolean);
}

function scanMatches(
  content: string,
  pattern: RegExp,
  handler: (match: RegExpMatchArray) => void
): void {
  pattern.lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    handler(match);
  }
  pattern.lastIndex = 0;
}

export function detectClientSuppliedIdentifiers(content: string): ClientSuppliedIdentifierSignals {
  if (!content) {
    return {
      hasId: false,
      hasUserId: false,
      hasOrgId: false,
      hasPathOrQueryId: false,
      evidence: {}
    };
  }

  const state: ClientSuppliedIdentifierSignals = {
    hasId: false,
    hasUserId: false,
    hasOrgId: false,
    hasPathOrQueryId: false,
    evidence: {}
  };

  const record = (rawName: string, evidence: string): void => {
    const normalized = normalizeParamName(rawName);
    if (!normalized) return;
    const isUserId = matchesAny(USER_ID_NORMALIZED_PATTERNS, normalized);
    const isOrgId = matchesAny(ORG_ID_NORMALIZED_PATTERNS, normalized);
    const isGenericId = matchesAny(GENERIC_ID_RAW_PATTERNS, rawName);
    const isIdLike = isUserId || isOrgId || isGenericId;
    if (!isIdLike) return;

    if (isIdLike) {
      state.hasId = true;
      state.evidence.id = state.evidence.id ?? evidence;
      state.hasPathOrQueryId = true;
      state.evidence.pathOrQuery = state.evidence.pathOrQuery ?? evidence;
    }
    if (isUserId) {
      state.hasUserId = true;
      state.evidence.userId = state.evidence.userId ?? evidence;
      state.hasPathOrQueryId = true;
      state.evidence.pathOrQuery = state.evidence.pathOrQuery ?? evidence;
    }
    if (isOrgId) {
      state.hasOrgId = true;
      state.evidence.orgId = state.evidence.orgId ?? evidence;
      state.hasPathOrQueryId = true;
      state.evidence.pathOrQuery = state.evidence.pathOrQuery ?? evidence;
    }
  };

  scanMatches(content, REQUEST_PROP_PATTERN, (match) => {
    if (match[2]) record(match[2], match[0]);
  });
  scanMatches(content, REQUEST_BRACKET_PATTERN, (match) => {
    if (match[2]) record(match[2], match[0]);
  });
  scanMatches(content, REQUEST_PARAM_CALL_PATTERN, (match) => {
    if (match[1]) record(match[1], match[0]);
  });
  scanMatches(content, REQUEST_QUERY_GET_PATTERN, (match) => {
    if (match[1]) record(match[1], match[0]);
  });
  scanMatches(content, SEARCH_PARAM_CAPTURE_PATTERN, (match) => {
    if (match[1]) record(match[1], match[0]);
  });
  scanMatches(content, REQUEST_DESTRUCTURE_PATTERN, (match) => {
    const names = extractDestructuredNames(match[1] ?? "");
    if (names.length === 0) return;
    for (const name of names) {
      record(name, match[0]);
    }
  });

  return state;
}
