export async function writeAuditLog(entry: Record<string, unknown>) {
  console.log("audit:", entry);
}

export function alertSecurity(event: string, details: Record<string, unknown>) {
  console.warn("alert:", event, details);
}
