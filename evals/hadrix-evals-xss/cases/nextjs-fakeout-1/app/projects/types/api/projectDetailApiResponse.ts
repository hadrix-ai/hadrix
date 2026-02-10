export type ProjectDetailApiModel = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectDetailApiResponse = {
  project: ProjectDetailApiModel | null;
};
