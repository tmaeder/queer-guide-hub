import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Safety-layer regression guard.
 *
 * Venues, events and organizations in criminalising countries are hidden from
 * anonymous callers. `pgHybridSearch` defaults `includeGated` to false, so a
 * call site that simply FORGETS the flag does not fail loudly — it silently
 * hides gated content from signed-in users who are entitled to see it. That is
 * the exact failure this product exists to prevent, and it shipped undetected
 * on the filter-only-browse branch because every other call site had the flag.
 *
 * This is deliberately a source-level assertion rather than a behavioural test:
 * the defect class is "a new call site omits a property", which no amount of
 * testing the existing call sites would catch.
 */

const SRC = join(__dirname, "..", "src", "index.ts");
const source = readFileSync(SRC, "utf8");

/** Find the balanced-brace argument object of every `pgHybridSearch(` call. */
function pgHybridSearchCallSites(text: string): { index: number; body: string; inline: boolean }[] {
	const sites: { index: number; body: string; inline: boolean }[] = [];
	const needle = "pgHybridSearch(";
	let from = 0;
	for (;;) {
		const at = text.indexOf(needle, from);
		if (at === -1) break;
		from = at + needle.length;
		// Skip the import statement and the console.warn label.
		const lineStart = text.lastIndexOf("\n", at) + 1;
		const line = text.slice(lineStart, text.indexOf("\n", at));
		if (line.includes("import") || line.includes("console.warn")) continue;

		let depth = 0;
		let i = from;
		let started = false;
		for (; i < text.length; i++) {
			const c = text[i];
			if (c === "(") depth++;
			else if (c === ")") {
				if (depth === 0) break;
				depth--;
			} else if (c === "{") {
				started = true;
				depth++;
			} else if (c === "}") depth--;
		}
		sites.push({ index: at, body: text.slice(from, i), inline: started });
	}
	return sites;
}

/**
 * A call site may pass a pre-built args object by name
 * (`pgHybridSearch(env, pgArgs, …)`). Resolve those identifiers to their
 * `const <id> … = { … }` declaration so the flag is credited where it is
 * actually set, rather than reported as missing.
 */
function resolvesIncludeGated(site: { body: string; inline: boolean }, text: string): boolean {
	if (/\bincludeGated\b/.test(site.body)) return true;
	if (site.inline) return false;
	const identifiers = site.body.match(/\b[A-Za-z_$][\w$]*\b/g) ?? [];
	return identifiers.some((id) => {
		const decl = new RegExp(`const\\s+${id}\\b[^=]*=\\s*\\{`).exec(text);
		if (!decl) return false;
		// Walk the declaration's balanced braces.
		let depth = 0;
		let i = decl.index + decl[0].length - 1;
		const start = i;
		for (; i < text.length; i++) {
			if (text[i] === "{") depth++;
			else if (text[i] === "}" && --depth === 0) break;
		}
		return /\bincludeGated\b/.test(text.slice(start, i));
	});
}

const lineOf = (index: number) => source.slice(0, index).split("\n").length;

describe("search worker safety gating", () => {
	const sites = pgHybridSearchCallSites(source);

	it("finds every pgHybridSearch call site", () => {
		// Guards the guard: if the parser stops matching, this test would pass
		// vacuously with zero sites.
		expect(sites.length).toBeGreaterThanOrEqual(3);
	});

	it("passes includeGated at every pgHybridSearch call site", () => {
		const offenders = sites
			.filter((s) => !resolvesIncludeGated(s, source))
			.map((s) => `src/index.ts:${lineOf(s.index)}`);

		expect(
			offenders,
			`pgHybridSearch called without includeGated at:\n  ${offenders.join("\n  ")}\n\n` +
				"Omitting it defaults to false, which hides safety-gated content from " +
				"signed-in users instead of failing loudly. Pass `includeGated: authed`.",
		).toEqual([]);
	});

	it("derives authed from the signed JWT, never from the spoofable body", () => {
		expect(source).toMatch(/const authed = await isAuthenticatedRequest\(request, env\)/);
		expect(source).not.toMatch(/includeGated:\s*(?:!!)?\s*(?:body\.)?user_id/);
	});

	it("resolves authed before the filter-only-browse branch returns", () => {
		const authedAt = source.indexOf("const authed = await isAuthenticatedRequest(request, env)");
		const browseBranchAt = source.indexOf('body.query === "string" && body.query.trim().length === 0');
		expect(authedAt).toBeGreaterThan(-1);
		expect(browseBranchAt).toBeGreaterThan(-1);
		// Every URL-driven intent surface returns from the browse branch; if
		// `authed` is resolved after it, that branch can never gate correctly.
		expect(authedAt).toBeLessThan(browseBranchAt);
	});
});
