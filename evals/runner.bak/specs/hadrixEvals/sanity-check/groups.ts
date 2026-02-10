import type { EvalGroupSpec } from "../../../types.js";

export const SANITY_CHECK_GROUPS: EvalGroupSpec[] = [
  {
    id: "Sanity-A03",
    description: "A03 Injection sanity check in evals-sanity-check",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "src/unsafeSql.ts",
        expectation: "Unsafe raw SQL execution helper without parameterization",
        severity: "high",
      },
    ],
  },
];
