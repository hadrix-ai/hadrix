export type ProjectPulseProjectApi = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

export type ProjectPulseContextApi = {
  ticketId: string | null;
  queue: string | null;
  requestedBy: string | null;
};

export type ProjectPulseResponseApi = {
  project: ProjectPulseProjectApi | null;
  error: string | null;
  pulse: ProjectPulseContextApi;
};
