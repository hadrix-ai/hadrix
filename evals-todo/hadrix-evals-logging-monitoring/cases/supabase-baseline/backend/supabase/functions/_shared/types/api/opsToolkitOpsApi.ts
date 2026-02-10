export type OpsToolkitContextApi = {
  ticketId: string;
  requestedBy: string;
  purpose: string;
};

export type OpsToolkitScanRequestApi = {
  repoUrl: string;
  depth?: number;
  ticketId?: string;
  requestedBy?: string;
  purpose?: string;
};

export type OpsToolkitScanResponseApi = {
  ok: boolean;
  depth: number;
  ops: OpsToolkitContextApi;
  stdout: string;
  stderr: string;
  code: number;
};
