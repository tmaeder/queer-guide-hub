import { describe, it, expect } from "vitest";
import {
	parseJsonBody,
	validString,
	validInt,
	validEntityType,
	validEntityTypeArray,
	validUuid,
	rejectUnknown,
	sanitiseStoredString,
	validMetadata,
	validFilters,
} from "../src/validation";

const jsonReq = (body: string) =>
	new Request("https://x.test/", { method: "POST", headers: { "content-type": "application/json" }, body });

describe("parseJsonBody", () => {
	it("rejects a non-JSON content-type with 415", async () => {
		const r = await parseJsonBody(new Request("https://x/", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(415);
			expect(r.code).toBe("unsupported_media_type");
		}
	});
	it("rejects empty / malformed / non-object bodies", async () => {
		expect((await parseJsonBody(jsonReq("   "))).ok).toBe(false);
		expect((await parseJsonBody(jsonReq("{not json"))).ok).toBe(false);
		const arr = await parseJsonBody(jsonReq("[1,2]"));
		expect(arr.ok).toBe(false);
		if (!arr.ok) expect(arr.code).toBe("bad_root");
	});
	it("accepts a JSON object", async () => {
		const r = await parseJsonBody<{ a: number }>(jsonReq('{"a":1}'));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.a).toBe(1);
	});
});

describe("validString", () => {
	it("rejects non-strings", () => expect(validString(5, "q").ok).toBe(false));
	it("enforces min/max", () => {
		expect(validString("a", "q", { min: 2 }).ok).toBe(false);
		expect(validString("abc", "q", { max: 2 }).ok).toBe(false);
	});
	it("trims by default", () => {
		const r = validString("  hi  ", "q");
		expect(r.ok && r.value).toBe("hi");
	});
});

describe("validInt", () => {
	it("uses default when undefined", () => {
		const r = validInt(undefined, "n", { default: 20 });
		expect(r.ok && r.value).toBe(20);
	});
	it("rejects non-integers", () => {
		expect(validInt(1.5, "n").ok).toBe(false);
		expect(validInt("3" as unknown, "n").ok).toBe(false);
	});
	it("clamps when clamp:true, else range-errors", () => {
		const c = validInt(999, "n", { min: 1, max: 50, clamp: true });
		expect(c.ok && c.value).toBe(50);
		expect(validInt(999, "n", { max: 50 }).ok).toBe(false);
	});
});

describe("entity-type validators", () => {
	it("accepts known, rejects unknown", () => {
		expect(validEntityType("venue").ok).toBe(true);
		expect(validEntityType("spaceship").ok).toBe(false);
	});
	it("validEntityTypeArray validates members + caps length", () => {
		expect(validEntityTypeArray(["venue", "event"], "types").ok).toBe(true);
		expect(validEntityTypeArray(["venue", "nope"], "types").ok).toBe(false);
		expect(validEntityTypeArray(new Array(17).fill("venue"), "types").ok).toBe(false);
	});
});

describe("validUuid", () => {
	it("accepts a uuid, rejects junk", () => {
		expect(validUuid("20ccacee-3d9b-4d59-b5db-188c73d41805", "id").ok).toBe(true);
		expect(validUuid("not-a-uuid", "id").ok).toBe(false);
	});
	it("rejects the nil UUID (placeholder tracking pollutes trending)", () => {
		expect(validUuid("00000000-0000-0000-0000-000000000000", "id").ok).toBe(false);
	});
});

describe("rejectUnknown", () => {
	it("rejects unknown keys (param-injection guard)", () => expect(rejectUnknown({ q: 1, evil: 2 }, ["q"], "body").ok).toBe(false));
	it("passes when all keys are known", () => expect(rejectUnknown({ q: 1 }, ["q", "page"], "body").ok).toBe(true));
});

describe("sanitiseStoredString / validMetadata (XSS/SQL guards)", () => {
	it("blocks injection-vector chars, accepts a clean token", () => {
		expect(sanitiseStoredString("<script>", "f").ok).toBe(false);
		expect(sanitiseStoredString("a'b", "f").ok).toBe(false);
		expect(sanitiseStoredString("CleanToken", "f").ok).toBe(true);
	});
	it("validMetadata rejects unknown keys + unsafe values, accepts clean primitives", () => {
		expect(validMetadata({ evil: "x" }, ["name"]).ok).toBe(false);
		expect(validMetadata({ name: "<x>" }, ["name"]).ok).toBe(false);
		expect(validMetadata({ name: "Ok", n: 3, b: true }, ["name", "n", "b"]).ok).toBe(true);
	});
});

describe("validFilters — new per-type filter keys", () => {
	it("accepts target_groups, is_free, price_min/max, date_from/to and a valid sort", () => {
		const r = validFilters({
			types: ["event"],
			target_groups: ["lesbian", "trans"],
			is_free: true,
			price_min: 0,
			price_max: 50,
			date_from: "2026-06-01",
			date_to: "2026-06-30",
			sort: "date_asc",
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.target_groups).toEqual(["lesbian", "trans"]);
			expect(r.value.is_free).toBe(true);
			expect(r.value.price_min).toBe(0);
			expect(r.value.price_max).toBe(50);
			expect(r.value.sort).toBe("date_asc");
		}
	});

	it("rejects an unknown sort mode", () => {
		expect(validFilters({ sort: "cheapest" }).ok).toBe(false);
	});

	it("rejects a negative price and a non-boolean is_free", () => {
		expect(validFilters({ price_min: -5 }).ok).toBe(false);
		expect(validFilters({ is_free: "yes" }).ok).toBe(false);
	});
});
