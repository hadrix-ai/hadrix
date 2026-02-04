import type { EvalGroupSpec } from "../../../types.js";

export const SANITY_CHECK_GROUPS: EvalGroupSpec[] = [
  {
    id: "Sanity-A03",
    description: "A03 Injection sanity check in evals-sanity-check",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "src/unsafeSql.ts",
        expectation: "SQL injection: getProjectById interpolates params.id into raw SQL",
        ruleId: "sql_injection",
        anchorNodeId: "jelly:src/unsafeSql.ts:16:8:19:2",
        startLine: 16,
        endLine: 19,
        severity: "high",
      },
    ],
  },
];
