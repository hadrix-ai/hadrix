export type WorkspaceProject = {
  id: string;
  name: string;
  orgId: string;
  owner: string;
};

export const WorkspaceMemberRoles = {
  Viewer: "viewer",
  Editor: "editor",
  Owner: "owner",
} as const;

export type WorkspaceMemberRole =
  (typeof WorkspaceMemberRoles)[keyof typeof WorkspaceMemberRoles];
