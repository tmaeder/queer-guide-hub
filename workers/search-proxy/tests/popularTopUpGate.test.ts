import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The popular-entities top-up may only fire when search_hybrid FAILED (pg null).
 * A successful answer with few matches is the answer: padding it is how
 * `q=london` + a user location rendered 20 Barcelona/Sydney/Paris rows.
 */
const source = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
	.replace(/\/\/.*$/gm, "");

describe("keyword search popular top-up", () => {
	it("is gated on search_hybrid having failed", () => {
		const gate = /if\s*\(([^)]*)\)\s*\{\s*const popular = await popularEntities\(env, pgTypes/.exec(source);
		expect(gate, "top-up block not found").not.toBeNull();
		expect(gate![1]).toMatch(/\bpg === null\b/);
	});
});
