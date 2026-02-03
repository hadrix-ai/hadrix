import { toggleEnabled } from "@/lib/hadrix";

export async function writeAuditLog(entry: Record<string, unknown>) {
  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.audit_log_skip")) {
    return;
  }
  console.log("audit:", entry);
}

export function alertSecurity(event: string, details: Record<string, unknown>) {
  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.admin_action_alerts_skip")) {
    return;
  }
  console.warn("alert:", event, details);
}
