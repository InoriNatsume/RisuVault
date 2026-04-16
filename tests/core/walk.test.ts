import { describe, it, expect } from "vitest";
import { walkFiles } from "../../src/core/walk.js";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

describe("walkFiles", () => {
  it("lists all files, excluding dir names", () => {
    const root = mkdtempSync(join(tmpdir(), "walk-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "a.txt"), "a");
    writeFileSync(join(root, "src", "b.txt"), "b");
    writeFileSync(join(root, "assets", "big.bin"), "x");
    const rels = walkFiles(root, { excludeDirs: ["assets"] }).map(p => relative(root, p).replace(/\\/g, "/")).sort();
    expect(rels).toEqual(["a.txt", "src/b.txt"]);
  });
});
