import type { AuthContext } from "./auth.ts";
import type { ProjectPulseContextApi } from "./types/api/projectPulseApi.ts";

export function buildProjectPulseContext(body: unknown, auth: AuthContext): ProjectPulseContextApi {
  if (!isRecord(body)) {
    return { ticketId: null, queue: null, requestedBy: auth.email ?? auth.userId ?? null };
  }

  const pulse = isRecord(body.pulse) ? body.pulse : {};
  const ticketId = readOptionalString(body.ticketId) ?? readOptionalString(pulse.ticketId);
  const queue = readOptionalString(body.queue) ?? readOptionalString(pulse.queue);
  const requestedBy =
    readOptionalString(body.requestedBy) ??
    readOptionalString(pulse.requestedBy) ??
    auth.email ??
    auth.userId ??
    null;

  return { ticketId, queue, requestedBy };
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
