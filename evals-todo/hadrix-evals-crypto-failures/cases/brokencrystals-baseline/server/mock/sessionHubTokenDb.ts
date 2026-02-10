import type { TokenDbClient } from "../types/infra/tokenDbClient.js";

export const SESSION_HUB_TOKEN_DB: TokenDbClient = {
  async query(_sql: string) {
    return { ok: true };
  },
};
