import { vulnEnabled } from "@/lib/hadrix";

export async function writeAuditLog(entry: Record<string, unknown>) {
  // HADRIX_VULN: A08 Logging & Monitoring Failures
  // Skip audit logging for sensitive admin actions.
  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.no_audit_logs")) {
    return;
  }
  console.log("audit:", entry);
}

export function alertSecurity(event: string, details: Record<string, unknown>) {
  // HADRIX_VULN: A08 Logging & Monitoring Failures
  // No alerts for privilege escalation or destructive actions.
  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.no_alerts_for_privilege_escalation")) {
    return;
  }
  console.warn("alert:", event, details);
}
