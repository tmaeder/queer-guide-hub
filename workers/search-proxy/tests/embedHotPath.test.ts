import { describe, it, expect } from "vitest";
import { embed, type EmbedTimings } from "../src/ai";
import type { Env } from "../src/index";

/**
 * The 30-day KV write of a fresh embedding must not sit on the hot path.
 * embed() used to `await` it after the vector was already in hand, so every
 * first-time search paid a KV write before search_hybrid could start.
 */

function env(opts: { putDelayMs?: number; cached?: number[] } = {}) {
	const puts: string[] = [];
	let putSettled = false;
	const e = {
		AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
		EMBED_CACHE: {
			get: async () => opts.cached ?? null,
			put: async (k: string) => {
				puts.push(k);
				if (opts.putDelayMs) await new Promise((r) => setTimeout(r, opts.putDelayMs));
				putSettled = true;
			},
		},
	} as unknown as Env;
	return { e, puts, isPutSettled: () => putSettled };
}

describe("embed() keeps the cache write off the hot path", () => {
	it("returns the vector before a slow KV write finishes, and hands the write to waitUntil", async () => {
		const { e, puts, isPutSettled } = env({ putDelayMs: 300 });
		const waited: Promise<unknown>[] = [];
		const timings: EmbedTimings = {};
		const started = Date.now();
		const vec = await embed(e, "queer bookshop porto", { waitUntil: (p) => waited.push(p), timings });
		expect(vec).toEqual([0.1, 0.2, 0.3]);
		expect(Date.now() - started).toBeLessThan(200);
		expect(isPutSettled()).toBe(false); // still in flight…
		expect(waited).toHaveLength(1); // …but kept alive
		await Promise.all(waited);
		expect(isPutSettled()).toBe(true);
		expect(puts).toHaveLength(1);
		expect(timings.cacheHit).toBe(false);
		expect(typeof timings.aiMs).toBe("number");
		expect(timings.kvPutMs).toBeUndefined(); // not measured: it was not awaited
	});

	it("still awaits the write when the caller has no waitUntil", async () => {
		const { e, isPutSettled } = env({ putDelayMs: 50 });
		const timings: EmbedTimings = {};
		await embed(e, "queer bookshop porto", { timings });
		expect(isPutSettled()).toBe(true);
		expect(typeof timings.kvPutMs).toBe("number");
	});

	it("reports a cache hit and makes no model call", async () => {
		const { e, puts } = env({ cached: [9, 9, 9] });
		const timings: EmbedTimings = {};
		expect(await embed(e, "berlin", { waitUntil: () => undefined, timings })).toEqual([9, 9, 9]);
		expect(timings.cacheHit).toBe(true);
		expect(timings.aiMs).toBeUndefined();
		expect(puts).toHaveLength(0);
	});
});
