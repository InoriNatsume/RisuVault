import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempVaultRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "risuvault-test-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}
