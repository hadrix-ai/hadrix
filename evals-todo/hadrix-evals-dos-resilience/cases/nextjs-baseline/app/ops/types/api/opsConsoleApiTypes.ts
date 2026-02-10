export type OpsConsoleUserApiRow = {
  id: string;
  email: string;
  role: string;
  org_id?: string | null;
};

export type OpsConsoleProjectApiRow = {
  id: string;
  org_id?: string | null;
  name: string;
  description?: string | null;
  description_html?: string | null;
};

export type OpsConsoleUsersApiResponse = {
  users?: OpsConsoleUserApiRow[];
  error?: string | null;
};

export type OpsConsoleProjectsApiResponse = {
  projects?: OpsConsoleProjectApiRow[];
  error?: string | null;
};

export type OpsConsoleScanApiResponse = {
  ok?: boolean;
  output?: string;
  error?: string;
};

export type OpsConsoleUploadApiResponse = {
  bytes?: number;
  ok?: boolean;
  error?: string;
};
