import { describe, expect, it } from "vitest";
import { entityTypeToTargetTable, SubmitBody } from "../src/schema";

describe("SubmitBody schema", () => {
  it("accepts a minimal venue submission", () => {
    const r = SubmitBody.safeParse({
      entity_type: "venue",
      raw_data: { name: "X", city: "Berlin" },
      source_url: "https://example.com/x",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid source_url", () => {
    const r = SubmitBody.safeParse({
      entity_type: "venue",
      raw_data: {},
      source_url: "not-a-url",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown entity_type", () => {
    const r = SubmitBody.safeParse({
      entity_type: "spaceship",
      raw_data: {},
      source_url: "https://example.com",
    });
    expect(r.success).toBe(false);
  });
});

describe("entityTypeToTargetTable", () => {
  it("maps known entity types", () => {
    expect(entityTypeToTargetTable("venue")).toBe("venues");
    expect(entityTypeToTargetTable("event")).toBe("events");
    expect(entityTypeToTargetTable("stay")).toBe("stays");
    expect(entityTypeToTargetTable("organization")).toBe("personalities");
  });
  it("returns null for unrouted types", () => {
    expect(entityTypeToTargetTable("news_article")).toBeNull();
    expect(entityTypeToTargetTable("marketplace_item")).toBeNull();
  });
});
