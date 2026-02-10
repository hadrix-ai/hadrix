import type { CoreFinding, Severity } from "../../src/types.js";

export type EvalFinding = Pick<
  CoreFinding,
  "type" | "source" | "severity" | "category" | "summary" | "location" | "details"
> & {
  id: string;
};

export type ExpectedFinding = {
  /**
   * Stable identifier for this expected finding (useful for debugging / reporting).
   */
  id?: string;
  /**
   * Repo-relative filepath expected for the finding (deterministic match key).
   */
  filepath: string;
  /**
   * Human-written description of the issue and/or fix expectation.
   * This is compared against the actual finding's `summary`.
   */
  expectation: string;
  /**
   * Optional table reference used by structured matchers (e.g. "public.users").
   */
  tableRef?: string | null;
  /**
   * Optional hints to tighten matching.
   */
  severity?: Severity | null;
  source?: string | null;
  ruleId?: string | null;
  startLine?: number | null;
  endLine?: number | null;
};

export type EvalGroupSpec = {
  id: string;
  description?: string;
  expectedFindings: ExpectedFinding[];
  /**
   * If true, extra (unmatched) findings do not fail the group.
   */
  allowUnexpected?: boolean;
  /**
   * Optional filter to scope the actual findings considered for this group.
   */
  actualFilter?: (finding: EvalFinding) => boolean;
  /**
   * Optional comparator override for this group.
   */
  comparator?: SummaryComparator;
};

export type EvalRepoSpec = {
  /**
   * Optional stable identifier for this spec (handy for selection).
   * If omitted, `repoFullName` can be used as an identifier.
   */
  id?: string;
  repoFullName: string;
  repoUrl?: string;
  /**
   * Logical test groups for this repo (e.g. "secrets", "deps", "auth").
   */
  groups: EvalGroupSpec[];
};

export type SummaryComparison = {
  match: boolean;
  score?: number;
  rationale?: string;
};

export type SummaryComparator = (args: {
  expected: ExpectedFinding;
  actual: EvalFinding;
}) => Promise<SummaryComparison> | SummaryComparison;

export type EvalMatch = {
  expected: ExpectedFinding;
  actual: EvalFinding;
  comparison: SummaryComparison;
};

export type EvalGroupResult = {
  repoFullName: string;
  groupId: string;
  matched: EvalMatch[];
  missing: ExpectedFinding[];
  unexpected: EvalFinding[];
  pass: boolean;
};
