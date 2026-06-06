import { describe, it, expect } from "vitest";
import { favoriteTableFor } from "../src/supabase";

describe("favoriteTableFor", () => {
	it("maps supported entity types to their (table, column)", () => {
		expect(favoriteTableFor("venue")).toEqual({ table: "venue_favorites", col: "venue_id" });
		expect(favoriteTableFor("event")).toEqual({ table: "event_favorites", col: "event_id" });
		expect(favoriteTableFor("marketplace")).toEqual({ table: "marketplace_favorites", col: "listing_id" });
		expect(favoriteTableFor("news")).toEqual({ table: "news_favorites", col: "article_id" });
	});

	it("returns null for unsupported types", () => {
		expect(favoriteTableFor("city")).toBeNull();
		expect(favoriteTableFor("personality")).toBeNull();
		expect(favoriteTableFor("")).toBeNull();
	});
});
