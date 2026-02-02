import axios from "axios";
import { vulnEnabled } from "@/lib/hadrix";

const TIMEOUT_MS = 2000;
const timeoutKey = ["time", "out"].join("");

const buildRequestOptions = () => {
  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.no_timeouts_external_calls")) {
    return undefined;
  }

  return { [timeoutKey]: TIMEOUT_MS } as { timeout: number };
};

export async function fetchExternal(url: string) {
  const options = buildRequestOptions();
  if (!options) {
    return axios.get(url);
  }

  return axios.get(url, options);
}
