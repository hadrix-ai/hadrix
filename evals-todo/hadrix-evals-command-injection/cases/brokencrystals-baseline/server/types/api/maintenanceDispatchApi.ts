export interface MaintenanceDispatchRunApiRequest {
  task: string;
  requestedBy?: string;
  ticketId?: string;
}

export interface MaintenanceDispatchRunApiSuccessResponse {
  output: string;
  error: string;
}

export interface MaintenanceDispatchRunApiErrorResponse {
  error: string;
  stderr?: string;
}
