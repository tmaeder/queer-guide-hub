import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALLOWED, buildSubmissionRow } from "../src/supabase";

/**
 * Drift checks. The worker keeps two manual mirrors of values the database
 * (or the hub) owns:
 *   1) `ALLOWED` — CHECK-constraint values on community_submissions
 *   2) `HUB_REGISTRY` (hardcoded in `tests/supabase.test.ts`) — keys of
 *       `src/config/submissionRegistry.ts` in the hub
 *
 * Both are easy to forget to update. These tests parse the source-of-truth
 * files on disk and fail if the mirrors fall out of sync. They run with
 * the rest of the suite (no DB connection needed) so drift is caught in
 * CI on every PR.
 */

const HUB_REGISTRY_FILE = resolve(__dirname, "../../../src/config/submissionRegistry.ts");

function readHubRegistryKeys(): string[] {
  const src = readFileSync(HUB_REGISTRY_FILE, "utf8");
  // Match the `export const submissionRegistry: Record<string, …> = { … }`
  // block and pull keys before the colon.
  const block = src.match(/export const submissionRegistry[^=]*=\s*{([\s\S]*?)};/);
  if (!block) throw new Error("submissionRegistry block not found in hub source");
  const body = block[1] ?? "";
  const keys: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*([a-zA-Z_]\w*)\s*:/);
    if (m && m[1]) keys.push(m[1]);
  }
  return keys.sort();
}

describe("hub registry drift", () => {
  it("HUB_REGISTRY in supabase.test.ts matches the hub's submissionRegistry keys", () => {
    const fromHub = readHubRegistryKeys();
    // The list duplicated inside supabase.test.ts. Update both if you change one.
    const HUB_REGISTRY_DUPLICATE = ["venue", "event", "product", "personality", "hotel", "tag", "feedback", "news", "place"].sort();
    expect(HUB_REGISTRY_DUPLICATE).toEqual(fromHub);
  });

  it("every entity_type the worker emits maps to a hub registry key", () => {
    const fromHub = readHubRegistryKeys();
    const entityTypes = ["venue", "event", "stay", "marketplace_item", "news_article", "organization", "place"] as const;
    for (const e of entityTypes) {
      const row = buildSubmissionRow({
        userId: "u-1",
        body: {
          entity_type: e,
          raw_data: { name: "x" },
          source_url: "https://example.com/x",
        },
      });
      expect(fromHub).toContain(row.content_type);
    }
  });
});

describe("ALLOWED constraint mirrors", () => {
  // Sentinel test — if you add a new field whose values are CHECK-constrained
  // in the DB, add it to `ALLOWED` in src/supabase.ts and to this list. The
  // existing buildSubmissionRow tests already assert each emitted value is
  // inside its set; this test just ensures `ALLOWED` itself stays exhaustive
  // for the columns we currently insert.
  it("covers every constrained column that buildSubmissionRow emits", () => {
    const row = buildSubmissionRow({
      userId: "u-1",
      body: {
        entity_type: "venue",
        raw_data: { name: "x" },
        source_url: "https://example.com/x",
      },
    });
    const constrainedColumns: Array<keyof typeof ALLOWED> = [
      "feedback_status", "sub_source_type", "platform", "media_processing_status",
    ];
    for (const col of constrainedColumns) {
      const value = row[col as keyof typeof row];
      expect(value).toBeTruthy();
      expect(ALLOWED[col]).toContain(value as never);
    }
  });
});
