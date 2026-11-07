import { afterEach, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

function requestAutocomplete() {
	const env = {
		SUPABASE_URL: "https://example.supabase.co",
		SUPABASE_SERVICE_KEY: "test-key",
		SESSION_CACHE: { get: async () => null, put: async () => {} },
	} as unknown as Env;
	return worker.fetch(new Request("https://search.queer.guide/autocomplete", {
		method: "POST",
		headers: { "Content-Type": "application/json", "CF-Ray": "test-ray" },
		body: JSON.stringify({ query: "Berlin", types: ["city"], limit: 20 }),
	}), env, { waitUntil: vi.fn() } as unknown as ExecutionContext);
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("returns scoped suggestions from an RPC that takes longer than 800 ms", async () => {
	vi.useFakeTimers();
	vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
		expect(JSON.parse(init.body as string).p_content_types).toEqual(["city"]);
		await new Promise((resolve) => setTimeout(resolve, 900));
		return Response.json([{ objectID: "city-1", type: "city", title: "Berlin", slug: "berlin" }]);
	}));

	const response = requestAutocomplete();
	await vi.advanceTimersByTimeAsync(900);
	const result = await response;
	expect(result.status).toBe(200);
	expect(await result.json()).toMatchObject({ suggestions: [{ type: "city", slug: "berlin" }] });
});

it("aborts a stalled RPC and reports temporary unavailability", async () => {
	vi.useFakeTimers();
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.stubGlobal("fetch", vi.fn((_url: string, { signal }: RequestInit) => new Promise((_resolve, reject) => {
		signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
	})));

	const response = requestAutocomplete();
	await vi.advanceTimersByTimeAsync(2500);
	const result = await response;
	expect(result.status).toBe(503);
	expect(await result.json()).toMatchObject({ code: "autocomplete_unavailable" });
	expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: "timeout", rayId: "test-ray" }));
});
