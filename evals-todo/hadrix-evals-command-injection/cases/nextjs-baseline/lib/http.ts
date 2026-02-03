import axios from "axios";
import { toggleEnabled } from "@/lib/hadrix";

export async function fetchExternal(url: string) {
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.external_call_timeout_override")) {
    return axios.get(url);
  }

  return axios.get(url, { timeout: 2000 });
}
