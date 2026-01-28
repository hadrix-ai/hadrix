export function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  return value.trim();
}

export function readEnvRaw(name: string): string | undefined {
  return process.env[name];
}

export function readFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return null;
}

export function parseJsonEnv(name: string): Record<string, string> {
  const raw = readEnv(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}
