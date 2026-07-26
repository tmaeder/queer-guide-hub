import { describe, expect, it } from "vitest";
import { extractTextToolCalls } from "../src/model";

describe("extractTextToolCalls", () => {
	it("passes plain prose through untouched", () => {
		const r = extractTextToolCalls("Here are some great bars in Madrid.");
		expect(r.text).toBe("Here are some great bars in Madrid.");
		expect(r.calls).toEqual([]);
	});

	it("extracts a leading tool-call array and keeps the prose", () => {
		const r = extractTextToolCalls(
			'[{"name": "search_entities", "arguments": {"query": "gay bars madrid"}}] Here is what I found.',
		);
		expect(r.calls).toEqual([{ name: "search_entities", arguments: { query: "gay bars madrid" } }]);
		expect(r.text).toBe("Here is what I found.");
	});

	it("returns empty text for a pure tool-call reply", () => {
		const r = extractTextToolCalls('{"name": "search_entities", "arguments": {"query": "pride", "city": "Lisbon"}}');
		expect(r.calls).toEqual([{ name: "search_entities", arguments: { query: "pride", city: "Lisbon" } }]);
		expect(r.text).toBe("");
	});

	it("strips hallucinated tool names from the text but never executes them", () => {
		const r = extractTextToolCalls(
			'[{"name": "search_events", "arguments": {"query": "gay bars", "city": "Lisbon"}}] Meanwhile, Lisbon has plenty.',
		);
		expect(r.calls).toEqual([]);
		expect(r.text).toBe("Meanwhile, Lisbon has plenty.");
	});

	it("supports the parameters key and the function wrapper", () => {
		const a = extractTextToolCalls('{"name": "search_entities", "parameters": {"query": "sauna"}}');
		expect(a.calls[0]).toEqual({ name: "search_entities", arguments: { query: "sauna" } });
		const b = extractTextToolCalls(
			'{"type": "function", "function": {"name": "search_entities", "arguments": "{\\"query\\": \\"sauna\\"}"}}',
		);
		expect(b.calls[0]).toEqual({ name: "search_entities", arguments: { query: "sauna" } });
	});

	it("leaves non-call JSON and invalid JSON alone", () => {
		const invalid = "Try {broken json} here.";
		expect(extractTextToolCalls(invalid).text).toBe(invalid);
		const plain = 'The config is {"limit": 5} by default.';
		expect(extractTextToolCalls(plain).text).toBe(plain);
		const named = '{"name": "Berlin"} is a city record.';
		expect(extractTextToolCalls(named).text).toBe(named);
	});

	it("handles braces inside JSON strings", () => {
		const r = extractTextToolCalls(
			'[{"name": "search_entities", "arguments": {"query": "bar {cool} \\"quoted\\""}}] Done.',
		);
		expect(r.calls[0].arguments).toEqual({ query: 'bar {cool} "quoted"' });
		expect(r.text).toBe("Done.");
	});

	it("extracts multiple separate blocks up to the bound", () => {
		const r = extractTextToolCalls(
			'{"name": "search_entities", "arguments": {"query": "a"}} and {"name": "get_recommendations", "arguments": {"city": "b"}} ok',
		);
		expect(r.calls.map((c) => c.name)).toEqual(["search_entities", "get_recommendations"]);
		expect(r.text).toBe("and ok");
	});
});
