export type RepoIntakeRequestApi = {
  repoUrl?: string;
  depth?: number;
  intakeId?: string;
  requestedBy?: string;
  purpose?: string;
};

export type RepoIntakeTicketApi = {
  intakeId: string;
  repoUrl: string;
  depth: number;
  requestedBy: string;
  purpose: string;
};

export type RepoIntakeCommandResultApi = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RepoIntakeResponseApi = RepoIntakeCommandResultApi & {
  ok: boolean;
  depth: number;
};
