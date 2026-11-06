import { describe, it, expect } from "vitest";
import { embed, hedged, type EmbedTimings } from "../src/ai";
import type { Env } from "../src/index";

/**
 * Hedged embedding call. The embed step ranged 0.44-1.75s on prod for the same
 * kind of query (2026-11-05): a tail, not a uniformly slow model. A second
 * identical call after the hedge delay cuts that tail at the cost of one extra
 * call on slow requests only.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A call whose n-th invocation (0-based) waits delays[n] ms, then succeeds or throws. */
function scripted(steps: Array<{ ms: number; fail?: boolean; value?: string }>) {
	let n = 0;
	const fn = async () => {
		const s = steps[Math.min(n++, steps.length - 1)];
		await sleep(s.ms);
		if (s.fail) throw new Error("model error");
		return s.value ?? "ok";
	};
	return { fn, calls: () => n };
}

describe("hedged()", () => {
	it("makes one call when the first answers before the hedge delay", async () => {
		const c = scripted([{ ms: 10, value: "first" }]);
		const t: { hedged?: boolean; hedgeWon?: boolean } = {};
		expect(await hedged(c.fn, 100, t)).toBe("first");
		await sleep(150); // the hedge timer must have been cleared
		expect(c.calls()).toBe(1);
		expect(t.hedged).toBeUndefined();
	});

	it("sends a second call when the first is slow, and uses whichever answers first", async () => {
		const c = scripted([{ ms: 600, value: "first" }, { ms: 20, value: "second" }]);
		const t: { hedged?: boolean; hedgeWon?: boolean } = {};
		const started = Date.now();
		expect(await hedged(c.fn, 100, t)).toBe("second");
		expect(Date.now() - started).toBeLessThan(400);
		expect(c.calls()).toBe(2);
		expect(t).toEqual({ hedged: true, hedgeWon: true });
	});

	it("keeps the first answer when it lands before the hedge does", async () => {
		const c = scripted([{ ms: 150, value: "first" }, { ms: 500, value: "second" }]);
		const t: { hedged?: boolean; hedgeWon?: boolean } = {};
		expect(await hedged(c.fn, 100, t)).toBe("first");
		expect(t).toEqual({ hedged: true, hedgeWon: false });
	});

	it("starts the second call at once when the first fails early", async () => {
		const c = scripted([{ ms: 5, fail: true }, { ms: 5, value: "second" }]);
		const started = Date.now();
		expect(await hedged(c.fn, 1000, {})).toBe("second");
		expect(Date.now() - started).toBeLessThan(200);
	});

	it("rejects only when both calls fail", async () => {
		const c = scripted([{ ms: 5, fail: true }, { ms: 5, fail: true }]);
		await expect(hedged(c.fn, 50, {})).rejects.toThrow("model error");
		expect(c.calls()).toBe(2);
	});

	it("is a plain single call when disabled", async () => {
		const c = scripted([{ ms: 200, value: "first" }]);
		expect(await hedged(c.fn, 0, {})).toBe("first");
		expect(c.calls()).toBe(1);
	});
});

describe("embed() uses the hedge", () => {
	function env(hedgeMs: string | undefined, delays: number[]) {
		let n = 0;
		const e = {
			EMBED_HEDGE_MS: hedgeMs,
			AI: {
				run: async () => {
					const ms = delays[Math.min(n++, delays.length - 1)];
					await sleep(ms);
					return { data: [[ms, 0, 0]] };
				},
			},
			EMBED_CACHE: { get: async () => null, put: async () => undefined },
		} as unknown as Env;
		return { e, calls: () => n };
	}

	it("returns the faster second embedding and records that it was hedged", async () => {
		const { e, calls } = env("100", [700, 20]);
		const t: EmbedTimings = {};
		expect(await embed(e, "queer bookshop porto", { waitUntil: () => undefined, timings: t })).toEqual([20, 0, 0]);
		expect(calls()).toBe(2);
		expect(t.hedged).toBe(true);
		expect(t.hedgeWon).toBe(true);
		expect(t.aiMs!).toBeLessThan(400);
	});

	it("EMBED_HEDGE_MS=0 turns it off", async () => {
		const { e, calls } = env("0", [250, 20]);
		const t: EmbedTimings = {};
		expect(await embed(e, "queer bookshop porto", { waitUntil: () => undefined, timings: t })).toEqual([250, 0, 0]);
		expect(calls()).toBe(1);
		expect(t.hedged).toBeUndefined();
	});
});
