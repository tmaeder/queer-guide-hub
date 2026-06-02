import { describe, it, expect } from "vitest";
import { TOOLS, executeTool } from "../src/tools";
import type { Env } from "../src/types";

describe("TOOLS", () => {
	it("exposes the grounded tools with valid schemas", () => {
		const names = TOOLS.map((t) => t.name).sort();
		expect(names).toEqual([
			"find_related",
			"get_recommendations",
			"knowledge_search",
			"search_entities",
		]);
		for (const t of TOOLS) {
			expect(typeof t.description).toBe("string");
			expect((t.parameters as { type?: string }).type).toBe("object");
		}
	});

	it("search_entities requires a query; find_related requires entity id+type", () => {
		const search = TOOLS.find((t) => t.name === "search_entities")!;
		expect((search.parameters as { required?: string[] }).required).toEqual(["query"]);
		const related = TOOLS.find((t) => t.name === "find_related")!;
		expect((related.parameters as { required?: string[] }).required).toEqual(["entity_type", "entity_id"]);
	});
});

describe("executeTool", () => {
	it("returns an error outcome (no network) for an unknown tool", async () => {
		const env = {} as Env;
		const outcome = await executeTool(env, "does_not_exist", {});
		expect(outcome.cards).toEqual([]);
		expect(JSON.parse(outcome.content)).toMatchObject({ error: expect.stringContaining("unknown tool") });
	});
});
