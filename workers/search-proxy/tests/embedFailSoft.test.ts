import { describe, it, expect, vi, afterEach } from "vitest";
import { embed } from "../src/ai";
import { pgHybridSearch } from "../src/pgSearch";
import type { Env } from "../src/index";

/**
 * Regression guard for the 2026-08-01 prod incident.
 *
 * While Workers AI was erroring (4006, account off Workers Paid), embed() returned a
 * zero vector. That was harmless under the old Meili semanticSearch but not under
 * Postgres search_hybrid: a zero vector is a valid vector, so the vnn top-200
 * admission nearest-neighbours the origin and RRF fusion floats ~200 arbitrary rows
 * over the real keyword hits. "queer bar berlin" returned a Madrid casino, while the
 * same query keyword-only returned the correct Berlin gay bar.
 *
 * The contract these tests pin: embedding failure => null => p_query_vec = NULL =>
 * keyword-only search. A zero vector must never reach search_hybrid.
 */

afterEach(() => vi.restoreAllMocks());

const kvMiss = {
	get: async () => null,
	put: async () => undefined,
};

function envWithAI(run: () => Promise<unknown>): Env {
	return {
		AI: { run },
		EMBED_CACHE: kvMiss,
	} as unknown as Env;
}

describe("embed() fail-soft contract", () => {
	it("returns null — not a zero vector — when the model call throws", async () => {
		const env = envWithAI(async () => {
			throw new Error("AiError: 4006 account not entitled");
		});

		const vec = await embed(env, "queer bar berlin");

		expect(vec).toBeNull();
	});

	it("still returns the vector on success", async () => {
		const env = envWithAI(async () => ({ data: [[0.1, 0.2, 0.3]] }));

		await expect(embed(env, "queer bar berlin")).resolves.toEqual([0.1, 0.2, 0.3]);
	});
});

describe("a null vector reaches search_hybrid as SQL NULL", () => {
	const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k" } as unknown as Env;

	/** pgHybridSearch also calls search_facets, which carries no vector — keep search_hybrid's body. */
	async function capturedArgs(queryVec: number[] | null) {
		let body: Record<string, unknown> = {};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init: RequestInit) => {
				if (String(url).endsWith("/rpc/search_hybrid")) body = JSON.parse(String(init.body));
				return { ok: true, json: async () => ({ hits: [], total: 0 }) } as unknown as Response;
			}),
		);
		await pgHybridSearch(env, {
			query: "queer bar berlin",
			queryVec,
			page: 0,
			hitsPerPage: 5,
		} as never);
		return body;
	}

	it("sends p_query_vec = null when the embedding failed", async () => {
		const body = await capturedArgs(null);

		// NULL is what makes search_hybrid skip vnn admission and rank on keywords alone.
		expect(body.p_query_vec).toBeNull();
		expect(body.p_query).toBe("queer bar berlin");
	});

	it("sends a pgvector literal when the embedding succeeded", async () => {
		const body = await capturedArgs([0.1, 0.2]);

		expect(body.p_query_vec).toBe("[0.1,0.2]");
	});
});
