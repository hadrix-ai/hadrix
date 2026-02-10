import type {
  OpsSnapshotApiContext,
  OpsSnapshotApiRequestBody
} from "../types/api/opsSnapshotApi.ts";

const normalizeOpsSnapshotField = (
  value: OpsSnapshotApiRequestBody[keyof OpsSnapshotApiRequestBody]
): string => String(value ?? "");

export function buildOpsSnapshotContext(
  body: OpsSnapshotApiRequestBody
): OpsSnapshotApiContext | null {
  const snapshotId = normalizeOpsSnapshotField(body.snapshotId);
  const queue = normalizeOpsSnapshotField(body.queue);
  const requestedBy = normalizeOpsSnapshotField(body.requestedBy);
  const view = normalizeOpsSnapshotField(body.view);

  if (!snapshotId && !queue && !requestedBy && !view) {
    return null;
  }

  return {
    id: snapshotId,
    queue,
    requestedBy,
    view
  };
}
