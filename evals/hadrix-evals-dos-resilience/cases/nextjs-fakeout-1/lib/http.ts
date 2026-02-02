import hadrixConfig from "../../../hadrix.config.json";

const DEFAULT_TIMEOUT_MS = 2000;

type HadrixConfigNode = Record<string, unknown> | undefined | null;

function vulnEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: HadrixConfigNode = hadrixConfig as HadrixConfigNode;
  for (const part of parts) {
    if (!current || typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[part] as HadrixConfigNode;
  }
  return Boolean(current);
}

export async function fetchExternal(url: string) {
  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.no_timeouts_external_calls")) {
    return fetch(url);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url);
  } finally {
    clearTimeout(timeout);
  }
}
