export type PublicEnvSecretHit = {
  name: string;
  evidence: string;
};

const PUBLIC_ENV_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "REACT_APP_",
  "NUXT_PUBLIC_",
  "PUBLIC_",
  "GATSBY_",
  "EXPO_PUBLIC_"
];

const SECRET_NAME_MARKERS = [
  "SERVICE_ROLE",
  "SECRET",
  "PRIVATE_KEY",
  "PASSWORD",
  "MASTER",
  "ADMIN",
  "ROOT"
];

const ENV_ACCESS_PATTERNS: RegExp[] = [
  /process\.env\.([A-Za-z0-9_]+)/g,
  /process\.env\[\s*["']([A-Za-z0-9_]+)["']\s*\]/g,
  /import\.meta\.env\.([A-Za-z0-9_]+)/g,
  /import\.meta\.env\[\s*["']([A-Za-z0-9_]+)["']\s*\]/g
];

const MAX_EVIDENCE_LENGTH = 140;

function isPublicEnvVar(name: string): boolean {
  for (const prefix of PUBLIC_ENV_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return false;
}

function hasSecretMarker(name: string): boolean {
  for (const marker of SECRET_NAME_MARKERS) {
    if (name.includes(marker)) return true;
  }
  return false;
}

function buildEvidence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_EVIDENCE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_EVIDENCE_LENGTH - 3)}...`;
}

export function detectPublicEnvSecretUsage(content: string): PublicEnvSecretHit | null {
  if (!content) return null;
  for (const pattern of ENV_ACCESS_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const rawName = match[1];
      if (!rawName) continue;
      const normalized = rawName.toUpperCase();
      if (!isPublicEnvVar(normalized)) continue;
      if (!hasSecretMarker(normalized)) continue;
      return {
        name: rawName,
        evidence: buildEvidence(match[0])
      };
    }
  }
  return null;
}
