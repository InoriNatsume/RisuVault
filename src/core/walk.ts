import { readdirSync } from "node:fs";
import { join } from "node:path";

export function walkFiles(
  root: string,
  opts: { excludeDirs?: string[] } = {}
): string[] {
  const excluded = new Set(opts.excludeDirs ?? []);
  const out: string[] = [];
  function walk(dir: string): void {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!excluded.has(ent.name)) walk(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}
