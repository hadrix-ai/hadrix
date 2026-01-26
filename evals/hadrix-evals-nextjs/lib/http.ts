import axios from "axios";
import { vulnEnabled } from "@/lib/hadrix";

export async function fetchExternal(url: string) {
  // HADRIX_VULN: A09 DoS / Resilience
  // No timeout on outbound requests when enabled.
  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.no_timeouts_external_calls")) {
    return axios.get(url);
  }

  return axios.get(url, { timeout: 2000 });
}
