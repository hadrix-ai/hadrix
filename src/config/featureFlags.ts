import { readEnvRaw } from "./env.js";

export const SUPABASE_SCHEMA_SCAN_FLAG = "HADRIX_ENABLE_SUPABASE_SCHEMA_SCAN";
export const DISABLE_COMPOSITE_SCAN_FLAG = "HADRIX_DISABLE_COMPOSITE_SCAN";

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

export function isCompositeScanEnabled(): boolean {
  const raw = readEnvRaw(DISABLE_COMPOSITE_SCAN_FLAG);
  if (raw == null) return true;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return true;
  if (TRUTHY.has(normalized)) return false;
  if (FALSY.has(normalized)) return true;
  return true;
}
