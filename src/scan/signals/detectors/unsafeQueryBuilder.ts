export type UnsafeQueryBuilderSignalHit = {
  ormQueryEvidence: string;
  untrustedInputEvidence: string;
};

const QUERY_BUILDER_RAW_EXPRESSION_METHODS = [
  "or",
  "whereRaw",
  "andWhereRaw",
  "orWhereRaw",
  "havingRaw",
  "orderByRaw",
  "groupByRaw",
  "joinRaw"
] as const;

const QUERY_BUILDER_STRING_WHERE_METHODS = ["where", "andWhere", "orWhere"] as const;

const QUERY_BUILDER_RAW_EXPRESSION_CALL_PATTERN = new RegExp(
  `\\.(${[
    ...QUERY_BUILDER_RAW_EXPRESSION_METHODS,
    ...QUERY_BUILDER_STRING_WHERE_METHODS
  ].join("|")})\\(\\s*([^\\n]{1,240})\\)`,
  "gi"
);

const SEQUELIZE_LITERAL_CALL_PATTERN =
  /\b(?:Sequelize|sequelize)\.literal\(\s*([^\n]{1,240})\)/g;

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const REQUEST_DERIVED_ASSIGN_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;\n]{0,240}\b(?:searchParams\.get\(|req\.(?:query|params|body)\b|request\.(?:query|params|body)\b)/gi;
const REQUEST_JSON_BODY_ASSIGN_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*await\s+[A-Za-z_$][A-Za-z0-9_$]*\.json\(\)/gi;

const DIRECT_UNTRUSTED_EXPRESSION_MARKERS: RegExp[] = [
  /searchParams\.get\s*\(/i,
  /\breq\.(?:query|params|body)\b/i,
  /\brequest\.(?:query|params|body)\b/i,
  /\bawait\s+[A-Za-z_$][A-Za-z0-9_$]*\.json\s*\(/i
];

const TEMPLATE_INTERPOLATION_VAR_PATTERN = /\$\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
const CONCAT_LEFT_VAR_PATTERN = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\+/g;
const CONCAT_RIGHT_VAR_PATTERN = /\+\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSnippet(value: string, limit = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function findLineAt(content: string, index: number): string {
  const safeIndex = Math.max(0, Math.min(index, content.length));
  const start = content.lastIndexOf("\n", safeIndex) + 1;
  const end = content.indexOf("\n", safeIndex);
  const line = content.slice(start, end === -1 ? content.length : end);
  return normalizeSnippet(line);
}

function findAssignmentLine(content: string, varName: string): string | null {
  if (!varName) return null;
  const pattern = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRegExp(varName)}\\b[^\\n]*`,
    "i"
  );
  const match = content.match(pattern);
  return match?.[0] ? normalizeSnippet(match[0]) : null;
}

function scanVarNames(content: string, pattern: RegExp): Set<string> {
  const results = new Set<string>();
  pattern.lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    if (match[1]) results.add(match[1]);
  }
  pattern.lastIndex = 0;
  return results;
}

function looksRequestDerivedFromAssignment(
  assignmentLine: string,
  requestBodyVars: Set<string>
): boolean {
  for (const marker of DIRECT_UNTRUSTED_EXPRESSION_MARKERS) {
    if (marker.test(assignmentLine)) return true;
  }
  for (const bodyVar of requestBodyVars) {
    const accessPattern = new RegExp(
      `\\b${escapeRegExp(bodyVar)}\\b[^\\n]{0,120}(?:\\.|\\[)`,
      "i"
    );
    if (accessPattern.test(assignmentLine)) return true;
  }
  return false;
}

function looksDirectlyRequestDerivedExpression(value: string): boolean {
  for (const marker of DIRECT_UNTRUSTED_EXPRESSION_MARKERS) {
    if (marker.test(value)) return true;
  }
  return false;
}

function splitFirstArgument(value: string): { firstArg: string; hasMore: boolean } {
  let inString: "'" | "\"" | "`" | null = null;
  let escape = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] ?? "";
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      inString = char as "'" | "\"" | "`";
      continue;
    }
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")" && parenDepth > 0) {
      parenDepth -= 1;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      continue;
    }
    if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }
    if (char === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return { firstArg: value.slice(0, i).trim(), hasMore: true };
    }
  }

  return { firstArg: value.trim(), hasMore: false };
}

function extractDynamicVarCandidates(expression: string): Set<string> {
  const vars = new Set<string>();
  TEMPLATE_INTERPOLATION_VAR_PATTERN.lastIndex = 0;
  for (const match of expression.matchAll(TEMPLATE_INTERPOLATION_VAR_PATTERN)) {
    if (match[1]) vars.add(match[1]);
  }
  TEMPLATE_INTERPOLATION_VAR_PATTERN.lastIndex = 0;

  CONCAT_LEFT_VAR_PATTERN.lastIndex = 0;
  for (const match of expression.matchAll(CONCAT_LEFT_VAR_PATTERN)) {
    if (match[1]) vars.add(match[1]);
  }
  CONCAT_LEFT_VAR_PATTERN.lastIndex = 0;

  CONCAT_RIGHT_VAR_PATTERN.lastIndex = 0;
  for (const match of expression.matchAll(CONCAT_RIGHT_VAR_PATTERN)) {
    if (match[1]) vars.add(match[1]);
  }
  CONCAT_RIGHT_VAR_PATTERN.lastIndex = 0;

  return vars;
}

function isDynamicStringExpression(expression: string): boolean {
  if (!expression) return false;
  return expression.includes("${") || expression.includes("+");
}

function isSimpleObjectOrArrayLiteral(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function detectUnsafeQueryBuilderSignals(content: string): UnsafeQueryBuilderSignalHit | null {
  if (!content) return null;

  const requestDerivedVars = scanVarNames(content, REQUEST_DERIVED_ASSIGN_PATTERN);
  const requestBodyVars = scanVarNames(content, REQUEST_JSON_BODY_ASSIGN_PATTERN);

  QUERY_BUILDER_RAW_EXPRESSION_CALL_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(QUERY_BUILDER_RAW_EXPRESSION_CALL_PATTERN)) {
    const method = (match[1] ?? "").trim();
    const rawArgs = match[2]?.trim() ?? "";
    if (!method || !rawArgs) continue;

    const { firstArg } = splitFirstArgument(rawArgs);
    if (!firstArg) continue;

    const normalizedMethod = method.trim().toLowerCase();
    const isStringWhereMethod = QUERY_BUILDER_STRING_WHERE_METHODS.some(
      (candidate) => candidate.toLowerCase() === normalizedMethod
    );
    if (isStringWhereMethod && isSimpleObjectOrArrayLiteral(firstArg)) {
      continue;
    }

    const ormQueryEvidence = findLineAt(content, match.index ?? 0);

    if (looksDirectlyRequestDerivedExpression(firstArg)) {
      return {
        ormQueryEvidence,
        untrustedInputEvidence: ormQueryEvidence
      };
    }

    if (IDENTIFIER_PATTERN.test(firstArg)) {
      if (requestDerivedVars.has(firstArg)) {
        return {
          ormQueryEvidence,
          untrustedInputEvidence: findAssignmentLine(content, firstArg) ?? ormQueryEvidence
        };
      }

      const assignmentLine = findAssignmentLine(content, firstArg);
      if (!assignmentLine) continue;
      if (looksRequestDerivedFromAssignment(assignmentLine, requestBodyVars)) {
        return {
          ormQueryEvidence,
          untrustedInputEvidence: assignmentLine
        };
      }
      continue;
    }

    if (!isDynamicStringExpression(firstArg)) continue;
    const dynamicVars = extractDynamicVarCandidates(firstArg);
    if (dynamicVars.size === 0) continue;
    for (const candidate of dynamicVars) {
      if (requestDerivedVars.has(candidate)) {
        return {
          ormQueryEvidence,
          untrustedInputEvidence: findAssignmentLine(content, candidate) ?? ormQueryEvidence
        };
      }
      const assignmentLine = findAssignmentLine(content, candidate);
      if (!assignmentLine) continue;
      if (looksRequestDerivedFromAssignment(assignmentLine, requestBodyVars)) {
        return { ormQueryEvidence, untrustedInputEvidence: assignmentLine };
      }
    }
  }
  QUERY_BUILDER_RAW_EXPRESSION_CALL_PATTERN.lastIndex = 0;

  SEQUELIZE_LITERAL_CALL_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(SEQUELIZE_LITERAL_CALL_PATTERN)) {
    const rawArgs = match[1]?.trim() ?? "";
    if (!rawArgs) continue;
    const { firstArg } = splitFirstArgument(rawArgs);
    if (!firstArg) continue;

    const ormQueryEvidence = findLineAt(content, match.index ?? 0);
    if (looksDirectlyRequestDerivedExpression(firstArg)) {
      return { ormQueryEvidence, untrustedInputEvidence: ormQueryEvidence };
    }

    if (IDENTIFIER_PATTERN.test(firstArg)) {
      if (requestDerivedVars.has(firstArg)) {
        return {
          ormQueryEvidence,
          untrustedInputEvidence: findAssignmentLine(content, firstArg) ?? ormQueryEvidence
        };
      }
      const assignmentLine = findAssignmentLine(content, firstArg);
      if (!assignmentLine) continue;
      if (looksRequestDerivedFromAssignment(assignmentLine, requestBodyVars)) {
        return { ormQueryEvidence, untrustedInputEvidence: assignmentLine };
      }
      continue;
    }

    if (!isDynamicStringExpression(firstArg)) continue;
    const dynamicVars = extractDynamicVarCandidates(firstArg);
    if (dynamicVars.size === 0) continue;
    for (const candidate of dynamicVars) {
      if (requestDerivedVars.has(candidate)) {
        return {
          ormQueryEvidence,
          untrustedInputEvidence: findAssignmentLine(content, candidate) ?? ormQueryEvidence
        };
      }
      const assignmentLine = findAssignmentLine(content, candidate);
      if (!assignmentLine) continue;
      if (looksRequestDerivedFromAssignment(assignmentLine, requestBodyVars)) {
        return { ormQueryEvidence, untrustedInputEvidence: assignmentLine };
      }
    }
  }
  SEQUELIZE_LITERAL_CALL_PATTERN.lastIndex = 0;

  return null;
}
