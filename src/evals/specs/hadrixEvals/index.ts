import type { EvalRepoSpec } from "../../types.js";
import { ORBIT_NEXT_GROUPS } from "./hadrix-nextjs-app/groups.js";
import { ORBIT_PROJECTS_GROUPS } from "./hadrix-react-supabase-app/groups.js";
import { SANITY_CHECK_GROUPS } from "./sanity-check/groups.js";

export const HADRIX_EVALS_REACT_SUPABASE_SPEC: EvalRepoSpec = {
  id: "hadrix-evals-react-supabase",
  repoFullName: "hadrix-ai/hadrix-evals-react-supabase",
  repoUrl: "https://github.com/hadrix-ai/hadrix-evals-react-supabase",
  groups: [...ORBIT_PROJECTS_GROUPS],
};

export const HADRIX_EVALS_NEXTJS_SPEC: EvalRepoSpec = {
  id: "hadrix-evals-nextjs",
  repoFullName: "hadrix-ai/hadrix-evals-nextjs",
  repoUrl: "https://github.com/hadrix-ai/hadrix-evals-nextjs",
  groups: [...ORBIT_NEXT_GROUPS],
};

export const HADRIX_EVALS_SANITY_CHECK_SPEC: EvalRepoSpec = {
  id: "evals-sanity-check",
  repoFullName: "hadrix-ai/evals-sanity-check",
  groups: [...SANITY_CHECK_GROUPS],
};
