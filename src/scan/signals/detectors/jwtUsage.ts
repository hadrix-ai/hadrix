const MAX_EVIDENCE_LENGTH = 140;

const JWT_DECODE_PATTERNS: RegExp[] = [
  /\bjwt\.decode\s*\(/i,
  /\bjsonwebtoken\.decode\s*\(/i,
  /\bjwtDecode\s*\(/i,
  /\bdecodeJwt\s*\(/i
];

function buildEvidence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_EVIDENCE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_EVIDENCE_LENGTH - 3)}...`;
}

function extractLineSnippet(content: string, index: number): string {
  if (index < 0) return "";
  const lineStart = content.lastIndexOf("\n", index);
  const lineEnd = content.indexOf("\n", index);
  const start = lineStart === -1 ? 0 : lineStart + 1;
  const end = lineEnd === -1 ? content.length : lineEnd;
  return buildEvidence(content.slice(start, end));
}

export function detectJwtDecodeEvidence(content: string): string | null {
  if (!content) return null;
  for (const pattern of JWT_DECODE_PATTERNS) {
    const match = pattern.exec(content);
    if (!match?.[0]) continue;
    return extractLineSnippet(content, match.index ?? content.indexOf(match[0]));
  }
  return null;
}
