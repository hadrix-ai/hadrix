export type ProjectBriefApiRecord = {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectBriefApiResponse = {
  project: ProjectBriefApiRecord | null;
  error: string | null;
};
