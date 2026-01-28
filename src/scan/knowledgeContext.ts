import { readFileSync } from "node:fs";
import path from "node:path";

function safeRead(relativePath: string): string {
  try {
    const fullPath = path.join(path.dirname(new URL(import.meta.url).pathname), relativePath);
    return readFileSync(fullPath, "utf-8");
  } catch {
    return "";
  }
}

export function buildKnowledgeContext(): string {
  const reactNext = safeRead("knowledge/react-next.md").trim();
  const supabase = safeRead("knowledge/supabase.md").trim();

  const parts = [reactNext, supabase].filter(Boolean);
  return parts.join("\n\n");
}
