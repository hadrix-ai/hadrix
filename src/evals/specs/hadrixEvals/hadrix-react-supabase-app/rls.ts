import type { EvalFinding, EvalGroupSpec, ExpectedFinding, SummaryComparator, SummaryComparison } from "../../../types.js";

const DATASTORE_RLS_FILEPATH_GLOB = "datastores/supabase/*/schema.md";

const TARGET_TABLES = [
  {
    id: "pg_table_rls_disabled",
    tableRef: "public.test_no_rls",
    ruleId: "rls_disabled",
    expectation: "public.test_no_rls: RLS disabled.",
  },
  {
    id: "pg_table_rls_enabled_no_policy",
    tableRef: "public.test_rls_no_policy",
    ruleId: "rls_no_policies",
    expectation: "public.test_rls_no_policy: RLS enabled but no policies.",
  },
] as const;

const TARGET_TABLE_REFS = new Set(TARGET_TABLES.map((t) => t.tableRef));
const TARGET_TABLE_NAMES = new Set(
  TARGET_TABLES.map((t) => t.tableRef.split(".")[1]).filter(Boolean)
);

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeIdentifier = (value: string): string =>
  value.replace(/"/g, "").trim().toLowerCase();

const normalizeRuleId = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeTableRef = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = normalizeIdentifier(value);
  if (!trimmed) return null;
  let cleaned = trimmed;
  if (cleaned.startsWith("table:")) {
    cleaned = cleaned.slice(6);
  } else if (cleaned.startsWith("policy:")) {
    cleaned = cleaned.slice(7);
  }
  const policyIndex = cleaned.indexOf("/");
  if (policyIndex >= 0) {
    cleaned = cleaned.slice(0, policyIndex);
  }
  const parts = cleaned.split(".").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[1]}`;
};

const extractRuleId = (finding: EvalFinding): string => {
  const details = (finding.details ?? {}) as Record<string, unknown>;
  return normalizeRuleId(details.ruleId ?? details.rule_id ?? details.ruleID);
};

const extractTableRefFromSummary = (summary: string): string | null => {
  const raw = summary ?? "";
  const quoted = raw.match(/"([^"]+)"\."([^"]+)"/);
  if (quoted?.[1] && quoted?.[2]) {
    return normalizeTableRef(`${quoted[1]}.${quoted[2]}`);
  }
  const simple = raw.match(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/i);
  if (simple?.[1] && simple?.[2]) {
    return normalizeTableRef(`${simple[1]}.${simple[2]}`);
  }
  const normalized = normalizeText(raw);
  for (const name of TARGET_TABLE_NAMES) {
    if (normalized.includes(name)) {
      return normalizeTableRef(`public.${name}`);
    }
  }
  return null;
};

const extractTableRef = (finding: EvalFinding): string | null => {
  const details = (finding.details ?? {}) as Record<string, unknown>;
  const direct = details.table_ref ?? details.tableRef ?? null;
  if (typeof direct === "string") {
    const normalized = normalizeTableRef(direct);
    if (normalized) return normalized;
  }
  const objectKey = details.object_key ?? details.objectKey ?? null;
  if (typeof objectKey === "string") {
    const normalized = normalizeTableRef(objectKey);
    if (normalized) return normalized;
  }
  const schema = details.object_schema ?? details.objectSchema ?? null;
  const name = details.object_name ?? details.objectName ?? null;
  if (typeof schema === "string" && typeof name === "string") {
    const normalized = normalizeTableRef(`${schema}.${name}`);
    if (normalized) return normalized;
  }
  return extractTableRefFromSummary(finding.summary ?? "");
};

const tableMatchesTarget = (tableRef: string | null): boolean => {
  if (!tableRef) return false;
  const normalized = normalizeTableRef(tableRef);
  if (!normalized) return false;
  if (TARGET_TABLE_REFS.has(normalized)) return true;
  const parts = normalized.split(".");
  const name = parts.length > 1 ? parts[1] : parts[0];
  return TARGET_TABLE_NAMES.has(name);
};

const summarySignalsRlsDisabled = (summary: string): boolean => {
  const text = normalizeText(summary);
  if (!text) return false;
  return (
    text.includes("rls disabled") ||
    text.includes("row level security disabled") ||
    text.includes("relrowsecurity false") ||
    (text.includes("rls") && text.includes("disabled"))
  );
};

const summarySignalsRlsEnabled = (summary: string): boolean => {
  const text = normalizeText(summary);
  if (!text) return false;
  return (
    text.includes("rls enabled") ||
    text.includes("row level security enabled") ||
    text.includes("relrowsecurity true") ||
    (text.includes("rls") && text.includes("enabled"))
  );
};

const extractPolicyCount = (summary: string): number | null => {
  const text = normalizeText(summary);
  if (!text) return null;
  const direct = text.match(/\bpolic(?:y|ies)\s*(?:count\s*)?(\d+)\b/);
  if (direct?.[1]) return Number.parseInt(direct[1], 10);
  const reversed = text.match(/\b(\d+)\s+polic(?:y|ies)\b/);
  if (reversed?.[1]) return Number.parseInt(reversed[1], 10);
  return null;
};

const summarySignalsNoPolicies = (summary: string): boolean => {
  const text = normalizeText(summary);
  if (!text) return false;
  if (text.includes("no policies") || text.includes("no policy")) return true;
  if (text.includes("zero policies") || text.includes("0 policies")) return true;
  if (text.includes("pg policies count 0") || text.includes("pg policies 0")) return true;
  const count = extractPolicyCount(summary);
  return count === 0;
};

const summarySignalsPoliciesExist = (summary: string): boolean => {
  const text = normalizeText(summary);
  if (!text) return false;
  const count = extractPolicyCount(summary);
  if (typeof count === "number" && count > 0) return true;
  return (
    text.includes("has policies") ||
    text.includes("policies exist") ||
    text.includes("policy exists") ||
    text.includes("has policy")
  );
};

const isDatastoreRlsFinding = (finding: EvalFinding): boolean => {
  const details = (finding.details ?? {}) as Record<string, unknown>;
  const tool = typeof details.tool === "string" ? details.tool.toLowerCase() : "";
  const source = typeof finding.source === "string" ? finding.source.toLowerCase() : "";
  const type = typeof finding.type === "string" ? finding.type.toLowerCase() : "";
  const ruleId = extractRuleId(finding);
  if (ruleId.startsWith("rls_")) return true;
  return (
    tool === "datastore_rls" ||
    source.includes("datastore_rls") ||
    type === "datastore_schema"
  );
};

const datastoreRlsActualFilter = (finding: EvalFinding): boolean => {
  const tableRef = extractTableRef(finding);
  if (!tableMatchesTarget(tableRef)) return false;
  if (isDatastoreRlsFinding(finding)) return true;
  const summary = normalizeText(finding.summary ?? "");
  return summary.includes("rls") || summary.includes("row level security");
};

const datastoreRlsComparator: SummaryComparator = ({ expected, actual }): SummaryComparison => {
  const expectedTable = normalizeTableRef(
    expected.tableRef ?? extractTableRefFromSummary(expected.expectation ?? "")
  );
  const actualTable = extractTableRef(actual);
  if (!expectedTable || !tableMatchesTarget(expectedTable)) {
    return { match: false, score: 0, rationale: "missing_expected_table" };
  }
  if (!actualTable || !tableMatchesTarget(actualTable)) {
    return { match: false, score: 0, rationale: "missing_actual_table" };
  }
  const expectedName = expectedTable.split(".")[1] ?? expectedTable;
  const actualNormalized = normalizeTableRef(actualTable) ?? "";
  const actualName = actualNormalized.split(".")[1] ?? actualNormalized;
  if (expectedName && actualName && expectedName !== actualName) {
    return { match: false, score: 0, rationale: "table_mismatch" };
  }

  const expectedRule = normalizeRuleId(expected.ruleId);
  const actualRule = extractRuleId(actual);
  const summary = actual.summary ?? "";

  const summaryEnabled = summarySignalsRlsEnabled(summary);
  const summaryDisabled = summarySignalsRlsDisabled(summary);
  const summaryNoPolicies = summarySignalsNoPolicies(summary);
  const summaryHasPolicies = summarySignalsPoliciesExist(summary);

  if (expectedRule === "rls_disabled") {
    if (summaryEnabled) {
      return { match: false, score: 0, rationale: "summary_contradiction_enabled" };
    }
    if (actualRule && actualRule !== "rls_disabled") {
      return { match: false, score: 0, rationale: "rule_id_mismatch" };
    }
    const ok = actualRule === "rls_disabled" || summaryDisabled;
    return { match: ok, score: ok ? 1 : 0, rationale: "rls_disabled_match" };
  }

  if (expectedRule === "rls_no_policies") {
    if (summaryDisabled || summaryHasPolicies) {
      return { match: false, score: 0, rationale: "summary_contradiction" };
    }
    if (actualRule && actualRule !== "rls_no_policies") {
      return { match: false, score: 0, rationale: "rule_id_mismatch" };
    }
    const ok =
      actualRule === "rls_no_policies" || (summaryNoPolicies && summaryEnabled);
    return { match: ok, score: ok ? 1 : 0, rationale: "rls_no_policies_match" };
  }

  return { match: false, score: 0, rationale: "unsupported_rule" };
};

const expectedFindings: ExpectedFinding[] = TARGET_TABLES.map((entry) => ({
  id: entry.id,
  filepath: DATASTORE_RLS_FILEPATH_GLOB,
  expectation: entry.expectation,
  ruleId: entry.ruleId,
  tableRef: entry.tableRef,
}));

export const DATASTORE_RLS_EVAL_GROUP: EvalGroupSpec = {
  id: "Orbit-Projects-RLS",
  description: "RLS eval fixtures in the connected Supabase datastore.",
  allowUnexpected: false,
  expectedFindings,
  actualFilter: datastoreRlsActualFilter,
  comparator: datastoreRlsComparator,
};
