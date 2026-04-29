import { describe, expect, it } from "vitest";
import { extractFromJsonLd, parseLdJson } from "../../../client-sdk/jsonld-core";
import { buildOgItem, type MetaMap } from "../../../client-sdk/og-core";

/**
 * Render-core parity tests. The actual /render endpoint (src/render.ts)
 * stitches together fetch + JSON-LD regex + HTMLRewriter for OG, but the
 * extraction logic itself lives in client-sdk and is the same pure code
 * the in-page extension runs. These tests pin that logic to the shapes
 * the worker actually feeds it: plain JSON-LD blobs and a populated
 * MetaMap from HTMLRewriter.
 *
 * If these pass, the worker's /render output matches the extension's
 * in-page behaviour for any page where:
 *   - SSR'd JSON-LD is present (Eventbrite/Outsavvy/most marketplaces), or
 *   - Only OG/Twitter cards are present (Substack, Medium).
 */

describe("worker render core: JSON-LD parity", () => {
  it("unwraps ItemList listing pages into N events (the bug PR #201 fixed for the client; render must match)", () => {
    const blob = parseLdJson(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: [
          { "@type": "ListItem", item: { "@type": "Event", name: "A", url: "https://x/a", startDate: "2026-05-01" } },
          { "@type": "ListItem", item: { "@type": "Event", name: "B", url: "https://x/b", startDate: "2026-05-02" } },
        ],
      }),
    );
    const out = extractFromJsonLd(blob, "https://x/list");
    expect(out.items).toHaveLength(2);
    expect(out.items.map((i) => i.raw_data.name).sort()).toEqual(["A", "B"]);
  });

  it("emits the same expanded venue fields the client emits (phone, postal_code, instagram)", () => {
    const blob = parseLdJson(
      JSON.stringify({
        "@type": "Restaurant",
        name: "Café SchwuZ",
        telephone: "+49 30 1234567",
        sameAs: ["https://instagram.com/schwuz"],
        address: { streetAddress: "Rollbergstr 26", postalCode: "12053", addressLocality: "Berlin" },
      }),
    );
    const item = extractFromJsonLd(blob, "https://x/cafe").items[0]!;
    expect(item.raw_data.phone).toBe("+49 30 1234567");
    expect(item.raw_data.postal_code).toBe("12053");
    expect(item.raw_data.instagram).toBe("schwuz");
  });

  it("resolves @id graph references — a Place referenced by an Event doesn't surface as a duplicate", () => {
    const blob = parseLdJson(
      JSON.stringify({
        "@graph": [
          { "@type": "Event", name: "Drag Brunch", location: { "@id": "#schwuz" } },
          { "@id": "#schwuz", "@type": "Place", name: "SchwuZ" },
        ],
      }),
    );
    const out = extractFromJsonLd(blob, "https://x/event");
    expect(out.items.filter((i) => i.entity_type === "event")).toHaveLength(1);
    expect(out.items.filter((i) => i.entity_type === "place")).toHaveLength(0);
  });
});

describe("worker render core: OpenGraph fallback (HTMLRewriter feeds buildOgItem)", () => {
  function meta(pairs: Record<string, string>): MetaMap {
    const m: MetaMap = new Map();
    for (const [k, v] of Object.entries(pairs)) m.set(k, v);
    return m;
  }

  it("Substack OG-only post → news_article (platform fallback)", () => {
    const item = buildOgItem(
      meta({
        "og:type": "website",
        "og:site_name": "QueerStack",
        "og:title": "Drag scene in 2026",
      }),
      "https://queerstack.substack.com/p/drag-2026",
    );
    expect(item).not.toBeNull();
    expect(item!.entity_type).toBe("news_article");
  });

  it("Eventbrite-style og:type=event → event with start_date", () => {
    const item = buildOgItem(
      meta({
        "og:type": "event",
        "og:title": "Pride 2026",
        "event:start_time": "2026-07-25T14:00",
      }),
      "https://e.example/x",
    );
    expect(item!.entity_type).toBe("event");
    expect(item!.raw_data.start_date).toBe("2026-07-25T14:00");
  });

  it("returns null when there's no recognisable og:type and no platform match", () => {
    const item = buildOgItem(
      meta({ "og:type": "website", "og:title": "Random" }),
      "https://random-site.example/page",
    );
    expect(item).toBeNull();
  });
});
