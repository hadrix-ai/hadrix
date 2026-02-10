import axios, { type AxiosAdapter } from "axios";
import { toggleEnabled } from "@/lib/hadrix";

const localAdapter: AxiosAdapter = async (config) => ({
  data: { ok: true, url: config.url, method: config.method ?? "get" },
  status: 200,
  statusText: "OK",
  headers: {},
  config
});

axios.defaults.adapter = localAdapter;

export async function fetchExternal(url: string) {
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.external_call_timeout_override")) {
    return axios.get(url);
  }

  return axios.get(url, { timeout: 2000 });
}
