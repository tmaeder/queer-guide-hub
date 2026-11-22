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

// ── parent_ref: the festival / series an event belongs to ────────────────
// schema.org's own EventSeries example (https://schema.org/EventSeries,
// copied verbatim 2026-11-22), shared with the Deno parser tests.
import { readFileSync } from "node:fs";
const OLYMPICS = JSON.parse(
  readFileSync(new URL("../../../supabase/functions/_shared/__fixtures__/schemaorg-eventseries-olympics.json", import.meta.url), "utf8"),
);

describe("worker render core: parent_ref", () => {
  it("records superEvent (a bare URL string in the schema.org example)", () => {
    const { items } = extractFromJsonLd(OLYMPICS, "https://www.olympic.org/");
    const rio = items.find((i) => i.raw_data.name === "The Rio 2016 Summer Olympics")!;
    expect(rio.raw_data.parent_ref).toEqual({ name: null, url: "http://www.olympic.org/olympic-games", type: null });
  });

  it("negative: an event with no superEvent and no container gets no parent_ref", () => {
    const { items } = extractFromJsonLd(
      { "@type": "Event", name: "Standalone", startDate: "2026-07-01" },
      "https://x.example/",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.raw_data).not.toHaveProperty("parent_ref");
  });

  it("events flattened out of Festival.subEvent[] carry the Festival; the Festival itself does not", () => {
    const { items } = extractFromJsonLd(
      {
        "@type": "Festival",
        name: "Folsom Europe 2027",
        url: "https://folsomeurope.berlin/",
        subEvent: [
          { "@type": "Event", name: "Street Fair", startDate: "2027-09-11" },
          { "@type": "Event", name: "Closing Party", startDate: "2027-09-12" },
        ],
      },
      "https://folsomeurope.berlin/",
    );
    // flatten keeps its existing shape: a subEvent ARRAY yields the children only
    expect(items.map((i) => i.raw_data.name)).toEqual(["Street Fair", "Closing Party"]);
    for (const i of items) {
      expect(i.raw_data.parent_ref).toEqual({ name: "Folsom Europe 2027", url: "https://folsomeurope.berlin/", type: "Festival" });
    }
  });

  it("a single subEvent object links the child to its EventSeries", () => {
    const { items } = extractFromJsonLd(
      {
        "@type": "EventSeries",
        name: "Travestie im Kiez Berlin",
        url: "https://www.ticketcorner.ch/artist/travestie-im-kiez-berlin/",
        subEvent: { "@type": "TheaterEvent", name: "Travestie im Kiez", startDate: "2026-09-04T20:30:00+02:00" },
      },
      "https://www.ticketcorner.ch/",
    );
    // EventSeries is not a mapped entity type, so only the dated child surfaces
    // as an item — and it still knows which series it belongs to.
    expect(items.map((i) => i.raw_data.name)).toEqual(["Travestie im Kiez"]);
    expect(items[0]!.raw_data.parent_ref).toMatchObject({ name: "Travestie im Kiez Berlin", type: "EventSeries" });
  });

  it("an ItemList / @graph wrapper is not a parent", () => {
    const { items } = extractFromJsonLd(
      { "@type": "ItemList", itemListElement: [{ item: { "@type": "Event", name: "A", startDate: "2026-01-01" } }] },
      "https://x.example/",
    );
    expect(items[0]!.raw_data).not.toHaveProperty("parent_ref");
  });
});
