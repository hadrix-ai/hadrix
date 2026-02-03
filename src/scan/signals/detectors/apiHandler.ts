const NEXT_ROUTE_HANDLER_PATTERN =
  /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/i;
const NEXT_ROUTE_CONST_PATTERN =
  /\bexport\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=\s*(?:async\s*)?\(?/i;
const NEXT_API_HANDLER_PATTERN =
  /\bexport\s+default\s+(?:async\s+)?function\s+\w+\s*\(\s*req\b[^)]*?\bres\b/i;
const EXPRESS_ROUTE_PATTERN =
  /\b(?:router|app)\.(get|post|put|patch|delete|options|head)\s*\(/i;

const PATTERNS = [
  NEXT_ROUTE_HANDLER_PATTERN,
  NEXT_ROUTE_CONST_PATTERN,
  NEXT_API_HANDLER_PATTERN,
  EXPRESS_ROUTE_PATTERN
];

export function detectApiHandler(content: string): string | null {
  if (!content) return null;
  for (const pattern of PATTERNS) {
    const match = content.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
