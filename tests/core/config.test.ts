import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeConfig, readConfig, generateDefaultConfig } from "../../src/core/config.js";
import { createTempVaultRoot } from "../helpers/tmp-vault.js";
import { mkdirSync } from "node:fs";
import { vaultDir } from "../../src/core/paths.js";

describe("config", () => {
  let tmp: { root: string; cleanup: () => void };
  beforeEach(() => { tmp = createTempVaultRoot(); mkdirSync(vaultDir(tmp.root)); });
  afterEach(() => tmp.cleanup());

  it("round-trips a config", () => {
    const cfg = generateDefaultConfig();
    writeConfig(tmp.root, cfg);
    const read = readConfig(tmp.root);
    expect(read).toEqual(cfg);
  });

  it("default config has 32-byte random salt", () => {
    const cfg = generateDefaultConfig();
    expect(cfg.kdf.saltHex.length).toBe(64);
    const cfg2 = generateDefaultConfig();
    expect(cfg.kdf.saltHex).not.toBe(cfg2.kdf.saltHex);
  });

  it("throws NotInitializedError if config missing", () => {
    expect(() => readConfig(tmp.root)).toThrow(/no .risuvault/);
  });
});
