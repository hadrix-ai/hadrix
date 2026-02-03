import axios from "axios";
import { toggleEnabled } from "@/lib/hadrix";

const TIMEOUT_MS = 2000;
const timeoutKey = ["time", "out"].join("");

const buildRequestOptions = () => {
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.external_call_timeout_override")) {
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
