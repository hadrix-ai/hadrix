export type ProjectSnapshotApiModel = {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectSnapshotApiResponse = {
  project: ProjectSnapshotApiModel;
};
