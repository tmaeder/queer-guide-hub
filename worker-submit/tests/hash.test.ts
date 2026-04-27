import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../src/hash";

describe("stableStringify", () => {
  it("sorts keys recursively", () => {
    expect(stableStringify({ b: 1, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"b":1}');
  });
  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });
  it("matches publisher hash for identical semantic payloads", async () => {
    const a = { name: "X", tags: ["a", "b"], extras: { y: 2, x: 1 } };
    const b = { extras: { x: 1, y: 2 }, tags: ["a", "b"], name: "X" };
    expect(await sha256Hex(stableStringify(a))).toBe(await sha256Hex(stableStringify(b)));
  });
});
