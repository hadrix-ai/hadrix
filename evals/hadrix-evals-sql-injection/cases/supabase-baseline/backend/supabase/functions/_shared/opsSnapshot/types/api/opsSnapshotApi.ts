export type OpsSnapshotApiRequestBody = {
  snapshotId?: string | number | null;
  queue?: string | null;
  requestedBy?: string | null;
  view?: string | null;
};

export type OpsSnapshotApiContext = {
  id: string;
  queue: string;
  requestedBy: string;
  view: string;
};

export type OpsSnapshotApiResponse = {
  opsSnapshot?: OpsSnapshotApiContext | null;
};
