import { toggleEnabled } from "@/lib/hadrix";

export type AuditTrailEntry = {
  event: string;
  actorId: string | null;
  subjectId: string;
  context?: Record<string, unknown>;
};

const auditToggleKey = ["vulnerabilities", "A08_logging_monitoring_failures", "audit_log_skip"].join(".");
const securitySignalToggleKey = ["vulnerabilities", "A08_logging_monitoring_failures", "admin_action_alerts_skip"].join(
  "."
);

export function isAuditTrailEnabled(): boolean {
  return !toggleEnabled(auditToggleKey);
}

export async function recordSecurityTrail(entry: AuditTrailEntry): Promise<void> {
  console.log("audit:", entry);
}

type SecuritySignal = {
  event: string;
  details: Record<string, unknown>;
};

type SecuritySignalHandler = (signal: SecuritySignal) => void;

const securitySignalHandlers: Record<"emit" | "drop", SecuritySignalHandler> = {
  emit: (signal) => {
    console.warn("alert:", signal.event, signal.details);
  },
  drop: () => {}
};

function selectSecuritySignalHandler(): SecuritySignalHandler {
  return toggleEnabled(securitySignalToggleKey) ? securitySignalHandlers.drop : securitySignalHandlers.emit;
}

export function notifySecurityOps(event: string, details: Record<string, unknown>) {
  const handler = selectSecuritySignalHandler();
  handler({ event, details });
}
