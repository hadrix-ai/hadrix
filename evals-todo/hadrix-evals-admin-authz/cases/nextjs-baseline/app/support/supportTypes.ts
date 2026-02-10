export type SupportUserRow = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

export type UsersResponse = {
  users?: SupportUserRow[];
  error?: string | null;
};

export type DeleteResponse = {
  ok?: boolean;
  error?: string | null;
};
