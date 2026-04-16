import { describe, it, expect } from "vitest";
import { bumpVersion, formatVersion } from "../../src/core/version.js";

describe("bumpVersion", () => {
  it("bumps minor by default", () => {
    expect(bumpVersion("1.0", "minor")).toBe("1.1");
    expect(bumpVersion("1.9", "minor")).toBe("1.10");
    expect(bumpVersion("2.5", "minor")).toBe("2.6");
  });
  it("bumps major and resets minor to 0", () => {
    expect(bumpVersion("1.5", "major")).toBe("2.0");
    expect(bumpVersion("3.0", "major")).toBe("4.0");
  });
  it("accepts explicit override", () => {
    expect(bumpVersion("1.0", { explicit: "3.14" })).toBe("3.14");
  });
  it("throws on unparseable current + minor bump", () => {
    expect(() => bumpVersion("v1-beta", "minor")).toThrow(/cannot bump/);
  });
  it("allows explicit override even when current is non-numeric", () => {
    expect(bumpVersion("v1-beta", { explicit: "1.0" })).toBe("1.0");
  });
});

describe("formatVersion", () => {
  it("prefixes v when called with prefix", () => {
    expect(formatVersion("1.2", { prefix: true })).toBe("v1.2");
    expect(formatVersion("1.2")).toBe("1.2");
  });
});
