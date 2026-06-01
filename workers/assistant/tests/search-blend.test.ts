import { describe, it, expect, vi, afterEach } from "vitest";
import { executeTool } from "../src/tools";
import type { Env } from "../src/types";

/**
 * search_entities runs the hybrid path: embed the query (bge-m3) and pass the
 * vector to search_hybrid, failing soft to keyword-only when embedding fails.
 */

afterEach(() => vi.restoreAllMocks());

function makeEnv(aiRun: (...a: unknown[]) => Promise<unknown>): Env {
	return {
		AI: { run: aiRun },
		SUPABASE_URL: "https://x.supabase.co",
		SUPABASE_SERVICE_KEY: "k",
		AI_GATEWAY_NAME: "qg-search",
	} as unknown as Env;
}

function hybridBodyOf(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const call = fetchSpy.mock.calls.find((c) => String(c[0]).includes("search_hybrid"))!;
	return JSON.parse((call[1] as RequestInit).body as string);
}

describe("search_entities semantic blending", () => {
	it("embeds the query and passes p_query_vec to search_hybrid", async () => {
		const aiRun = vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] }));
		const fetchSpy = vi.fn(
			async () => ({ ok: true, json: async () => ({ hits: [{ objectID: "v1", type: "venue", title: "Berghain" }] }) }) as unknown as Response,
		);
		global.fetch = fetchSpy as never;

		const out = await executeTool(makeEnv(aiRun), "search_entities", { query: "techno club" });

		expect(aiRun).toHaveBeenCalledTimes(1);
		const body = hybridBodyOf(fetchSpy);
		expect(body.p_query).toBe("techno club");
		expect(body.p_query_vec).toBe("[0.1,0.2,0.3]");
		expect(out.cards).toHaveLength(1);
	});

	it("falls back to keyword-only (null vector) when embedding fails", async () => {
		const aiRun = vi.fn(async () => {
			throw new Error("AI down");
		});
		const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ hits: [] }) }) as unknown as Response);
		global.fetch = fetchSpy as never;

		await executeTool(makeEnv(aiRun), "search_entities", { query: "x" });

		expect(hybridBodyOf(fetchSpy).p_query_vec).toBeNull();
	});
});
