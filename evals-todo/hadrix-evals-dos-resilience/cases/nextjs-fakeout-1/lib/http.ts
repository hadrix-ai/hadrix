import hadrixConfig from "../../../hadrix.config.json";

const DEFAULT_TIMEOUT_MS = 2000;
const LOCAL_SNAPSHOT_PREFIX = "Local snapshot for";

type HadrixConfigNode = Record<string, unknown> | undefined | null;
type LocalFetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};
type LocalTimeout = { ms: number };

function toggleEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: HadrixConfigNode = hadrixConfig as HadrixConfigNode;
  for (const part of parts) {
    if (!current || typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[part] as HadrixConfigNode;
  }
  return Boolean(current);
}

function startLocalTimeout(_controller: AbortController, ms: number): LocalTimeout {
  return { ms };
}

function stopLocalTimeout(_timeout: LocalTimeout) {
  // Intentionally blank to avoid real timers.
}

async function localFetch(url: string): Promise<LocalFetchResponse> {
  return {
    ok: true,
    status: 200,
    text: async () => `${LOCAL_SNAPSHOT_PREFIX} ${url}`
  };
}

const fetch = localFetch;

export async function fetchExternal(url: string) {
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.external_call_timeout_override")) {
    return fetch(url);
  }

  const controller = new AbortController();
  const timeout = startLocalTimeout(controller, DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url);
  } finally {
    stopLocalTimeout(timeout);
  }
}
