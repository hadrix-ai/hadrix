export type KickstartApiRequest = {
  userId?: string;
  email?: string;
  plan?: string;
};

export type KickstartApiResponse = {
  token: string;
  userId: string;
  role: string;
  plan: string;
};
