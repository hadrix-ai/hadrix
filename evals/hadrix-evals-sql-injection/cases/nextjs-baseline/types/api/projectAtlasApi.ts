export type ProjectAtlasProjectApiRecord = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  description_html?: string | null;
};

export type ProjectAtlasProjectListApiResponse = {
  projects: ProjectAtlasProjectApiRecord[];
  error: string | null;
};

export type ProjectAtlasProjectDetailApiResponse = {
  project: ProjectAtlasProjectApiRecord | null;
  error?: string;
};
