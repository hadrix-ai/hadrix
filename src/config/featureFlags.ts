import { readEnvRaw } from "./env.js";

export const SUPABASE_SCHEMA_SCAN_FLAG = "HADRIX_ENABLE_SUPABASE_SCHEMA_SCAN";

const TRUTHY = new Set(["1", "true", "yes", "y", "on"]);
const FALSY = new Set(["0", "false", "no", "n", "off"]);

export function isSupabaseSchemaScanEnabled(): boolean {
  const raw = readEnvRaw(SUPABASE_SCHEMA_SCAN_FLAG);
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return false;
}
