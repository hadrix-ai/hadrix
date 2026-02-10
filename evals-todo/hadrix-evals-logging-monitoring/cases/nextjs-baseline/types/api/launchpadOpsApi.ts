export type LaunchpadRequestResult = {
  status: number;
  payload: unknown;
};

export type LaunchpadCreateProjectRequest = {
  name: string;
  description: string;
  descriptionHtml: string;
};

export type LaunchpadScanRequest = {
  repoUrl: string;
};
