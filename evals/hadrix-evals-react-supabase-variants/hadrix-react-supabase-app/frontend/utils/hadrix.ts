import hadrixConfig from "../../hadrix.config.json";

export type HadrixConfig = typeof hadrixConfig;

export function toggleEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: any = hadrixConfig;
  for (const part of parts) {
    current = current?.[part];
  }
  return Boolean(current);
}
