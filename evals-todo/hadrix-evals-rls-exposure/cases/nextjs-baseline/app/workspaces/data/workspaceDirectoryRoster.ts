import type { WorkspaceProject } from "../types/domain/workspaceDirectoryDomain";

export const WORKSPACE_PROJECTS: WorkspaceProject[] = [
  { id: "prj_001", name: "Signal Shard", orgId: "org_ava", owner: "Ava L." },
  { id: "prj_002", name: "Blue Current", orgId: "org_ava", owner: "Ken R." },
  { id: "prj_003", name: "Lumen Trail", orgId: "org_kite", owner: "Mira K." },
];

export const WORKSPACE_FORM_DEFAULTS = {
  orgId: "org_ava",
  userId: "usr_new",
} as const;
