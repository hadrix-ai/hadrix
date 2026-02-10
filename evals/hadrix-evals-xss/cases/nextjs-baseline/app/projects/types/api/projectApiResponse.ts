export type ProjectApiModel = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectApiResponse = {
  project: ProjectApiModel | null;
};
