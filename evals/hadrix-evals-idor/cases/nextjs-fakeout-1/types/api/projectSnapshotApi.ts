export type ProjectSnapshotApiRecord = {
  id?: string | null;
  name?: string | null;
  org_id?: string | null;
  description?: string | null;
  description_html?: string | null;
};

export type ProjectSnapshotApiResponse = {
  project?: ProjectSnapshotApiRecord | null;
  error?: string | null;
};
