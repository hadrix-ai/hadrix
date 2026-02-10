export const INTEGRATION_KEY_DESK_CONFIG = {
  tokenEndpoint: "/api/tokens",
  headerKeys: {
    contentType: "content-type",
    userId: "x-user-id"
  },
  contentTypes: {
    json: "application/json"
  }
} as const;
