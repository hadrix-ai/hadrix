export type ProjectSpotlightProjectApiModel = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectSpotlightApiResponse = {
  project: ProjectSpotlightProjectApiModel | null;
  error?: string;
};
