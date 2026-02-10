import type { TokenIssueResponse, TokenRequestPayload } from "./consoleTypes";

type TokenRequestOptions = {
  headers: Record<string, string>;
  body: string;
};

export function buildTokenRequest(authToken: string, label: string): TokenRequestOptions {
  const trimmedToken = authToken.trim();
  const payload: TokenRequestPayload = { label: label.trim() };

  return {
    headers: {
      "content-type": "application/json",
      authorization: trimmedToken ? `Bearer ${trimmedToken}` : ""
    },
    body: JSON.stringify(payload)
  };
}

export async function requestTokenFromApi(
  authToken: string,
  label: string
): Promise<TokenIssueResponse> {
  const request = buildTokenRequest(authToken, label);
  const response = await fetch("/api/tokens", {
    method: "POST",
    headers: request.headers,
    body: request.body
  });

  return (await response.json()) as TokenIssueResponse;
}
