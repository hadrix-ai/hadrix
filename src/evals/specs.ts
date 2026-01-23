import type { EvalRepoSpec } from "./types.js";
import { HADRIX_EVALS_NEXTJS_SPEC, HADRIX_EVALS_REACT_SUPABASE_SPEC } from "./specs/hadrixEvals/index.js";

/**
 * Registry of eval specs known to the CLI.
 */
export const ALL_EVAL_SPECS: EvalRepoSpec[] = [
  HADRIX_EVALS_REACT_SUPABASE_SPEC,
  HADRIX_EVALS_NEXTJS_SPEC,
];
