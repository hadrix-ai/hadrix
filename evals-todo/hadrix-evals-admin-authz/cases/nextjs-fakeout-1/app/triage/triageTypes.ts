export type TriageUserRow = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

export type TriageUsersResponse = {
  users?: TriageUserRow[];
  error?: string | null;
};
