export type SignalDeskUpdateApi = {
  id: string;
  title: string;
  detail: string;
  created_at: string;
};

export type SignalDeskViewerApi = {
  id: string | null;
  role: string;
};

export type SignalDeskFeedApiResponse = {
  channel: string;
  viewer: SignalDeskViewerApi;
  updates: SignalDeskUpdateApi[];
};
