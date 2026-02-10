export const AuditLogActions = {
  TicketNote: "ticket.note",
  ManualSync: "manual.sync",
  ExportRun: "export.run",
} as const;

export type AuditLogAction = (typeof AuditLogActions)[keyof typeof AuditLogActions];

export type AuditLogEntry = {
  id: string;
  actorId: string;
  action: AuditLogAction;
  summary: string;
  createdAt: string;
};
