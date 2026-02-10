import { toggleEnabled } from "@/lib/hadrix";

const DEFAULT_TIMEOUT_MS = 2000;

type ExternalCallResult = {
  status: number;
  data: {
    ok: boolean;
    url: string;
    timeoutMs: number | null;
  };
};

export async function fetchExternal(url: string): Promise<ExternalCallResult> {
  const timeoutMs = toggleEnabled("vulnerabilities.A09_dos_and_resilience.external_call_timeout_override")
    ? null
    : DEFAULT_TIMEOUT_MS;

  return {
    status: 200,
    data: {
      ok: true,
      url,
      timeoutMs,
    },
  };
}
