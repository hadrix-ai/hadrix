import type { AuthContext } from "./auth.ts";
import { DEFAULT_INTAKE_QUEUE, INTAKE_DESK_HEADER_NAMES } from "../constants/intake-desk.constants.ts";
import type { IntakeDeskContextApi } from "../types/api/intake-desk-context.ts";

export function getIntakeDeskContext(
  req: Request,
  auth: AuthContext,
  body: Record<string, unknown>
): IntakeDeskContextApi {
  const queue =
    req.headers.get(INTAKE_DESK_HEADER_NAMES.queue) ||
    (typeof (body as any).queue === "string" ? ((body as any).queue as string) : "") ||
    DEFAULT_INTAKE_QUEUE;
  const ticketId =
    req.headers.get(INTAKE_DESK_HEADER_NAMES.ticket) ||
    (typeof (body as any).ticketId === "string" ? ((body as any).ticketId as string) : "") ||
    null;
  const requestId =
    req.headers.get(INTAKE_DESK_HEADER_NAMES.request) ||
    (typeof (body as any).requestId === "string" ? ((body as any).requestId as string) : "") ||
    null;
  const requestedBy =
    req.headers.get(INTAKE_DESK_HEADER_NAMES.actor) ||
    (typeof (body as any).requestedBy === "string" ? ((body as any).requestedBy as string) : "") ||
    auth.email ||
    auth.userId;

  return { queue, ticketId, requestId, requestedBy };
}
