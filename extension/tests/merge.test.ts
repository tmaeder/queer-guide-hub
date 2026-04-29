import { describe, expect, it } from "vitest";
import { extractAllItems as extractAll } from "../src/shared/extractors";

describe("extractAll merge logic", () => {
  it("falls back to dom heuristics when no structured data", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body><h1>Lonely Heading</h1><address>Berlin</address></body></html>`,
      "text/html",
    );
    const items = extractAll(doc, "https://x");
    expect(items).toHaveLength(1);
    expect(items[0]!.extraction_method).toBe("dom");
    expect(items[0]!.confidence).toBeLessThan(0.5);
  });

  it("does not collapse list-page events that share an entity_type but have distinct urls", () => {
    const doc = new DOMParser().parseFromString(
      `<html><head>
        <script type="application/ld+json">${JSON.stringify({
          "@type": "ItemList",
          itemListElement: [
            { item: { "@type": "Event", name: "Drag Brunch", url: "https://x/a" } },
            { item: { "@type": "Event", name: "Drag Brunch", url: "https://x/b" } },
            { item: { "@type": "Event", name: "Block Party", url: "https://x/c" } },
          ],
        })}</script>
       </head><body></body></html>`,
      "text/html",
    );
    const items = extractAll(doc, "https://x");
    expect(items).toHaveLength(3);
  });

  it("prefers jsonld over opengraph for the same entity", () => {
    const doc = new DOMParser().parseFromString(
      `<html><head>
        <meta property="og:type" content="event">
        <meta property="og:title" content="Pride">
        <script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Pride", startDate: "2026-07-25" })}</script>
       </head><body></body></html>`,
      "text/html",
    );
    const items = extractAll(doc, "https://x");
    expect(items).toHaveLength(1);
    expect(items[0]!.extraction_method).toBe("jsonld");
    expect(items[0]!.raw_data.start_date).toBe("2026-07-25");
  });
});
