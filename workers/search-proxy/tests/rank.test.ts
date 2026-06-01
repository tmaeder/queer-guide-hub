import { describe, it, expect } from "vitest";
import { personalizedRank, type RankableHit } from "../src/rank";

const hit = (over: Partial<RankableHit>): RankableHit => ({ id: "x", content_type: "venue", _fused: 0.5, ...over });

describe("personalizedRank", () => {
	it("boosts home-city hits and surfaces the reason", () => {
		const out = personalizedRank([hit({ id: "a", city: "Berlin" })], { home_city: "berlin" }, new Set());
		expect(out[0]._personalScore).toBeCloseTo(0.6); // 0.5 + 0.1
		expect(out[0]._boostReason).toBe("home_city");
	});

	it("boosts interest-tag hits", () => {
		const out = personalizedRank([hit({ tags: ["techno"] })], { interests: ["techno"] }, new Set());
		expect(out[0]._personalScore).toBeCloseTo(0.55); // 0.5 + 0.05
		expect(out[0]._boostReason).toBe("interest");
	});

	it("penalizes recently-seen entities", () => {
		const out = personalizedRank([hit({ id: "a", content_type: "venue" })], {}, new Set(["venue:a"]));
		expect(out[0]._personalScore).toBeCloseTo(0.35); // 0.5 - 0.15
		expect(out[0]._boostReason).toBeNull();
	});

	it("exact-title match dominates ordering (bug #4 fallback)", () => {
		const out = personalizedRank(
			[hit({ id: "a", title: "Some Bar", _fused: 0.9 }), hit({ id: "b", title: "Berlin", _fused: 0.1 })],
			{},
			new Set(),
			"berlin",
		);
		expect(out[0].id).toBe("b"); // 0.1 + 1.0 beats 0.9
	});

	it("sorts by personal score descending", () => {
		const out = personalizedRank([hit({ id: "a", _fused: 0.2 }), hit({ id: "b", _fused: 0.8 })], {}, new Set());
		expect(out.map((h) => h.id)).toEqual(["b", "a"]);
	});
});
