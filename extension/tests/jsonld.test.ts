import { describe, expect, it } from "vitest";
import { extractJsonLd } from "../src/shared/extractors/jsonld";

function html(jsonld: unknown): Document {
  const parser = new DOMParser();
  const src = `<html><head><script type="application/ld+json">${JSON.stringify(jsonld)}</script></head><body></body></html>`;
  return parser.parseFromString(src, "text/html");
}

describe("jsonld extractor", () => {
  it("maps an Event with location, dates, image", () => {
    const doc = html({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Pride Berlin 2026",
      startDate: "2026-07-25T14:00",
      endDate: "2026-07-25T22:00",
      location: { "@type": "Place", name: "Tiergarten" },
      image: "https://example.com/pride.jpg",
    });
    const items = extractJsonLd(doc, "https://example.com/pride");
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.entity_type).toBe("event");
    expect(item.raw_data.name).toBe("Pride Berlin 2026");
    expect(item.raw_data.start_date).toBe("2026-07-25T14:00");
    expect(item.raw_data.venue_name).toBe("Tiergarten");
    expect(item.raw_data.images).toEqual(["https://example.com/pride.jpg"]);
    expect(item.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("maps a Restaurant with address and geo", () => {
    const doc = html({
      "@type": "Restaurant",
      name: "Café SchwuZ",
      address: { streetAddress: "Rollbergstr 26", addressLocality: "Berlin", addressCountry: "DE" },
      geo: { latitude: 52.4801, longitude: 13.4377 },
    });
    const item = extractJsonLd(doc, "https://example.com/cafe")[0]!;
    expect(item.entity_type).toBe("venue");
    expect(item.raw_data.city).toBe("Berlin");
    expect(item.raw_data.latitude).toBe(52.4801);
    expect(item.raw_data.longitude).toBe(13.4377);
  });

  it("maps a Hotel to stay", () => {
    const doc = html({ "@type": "Hotel", name: "Axel Hotel Berlin", url: "https://x.example" });
    expect(extractJsonLd(doc, "https://x.example")[0]?.entity_type).toBe("stay");
  });

  it("maps a Product with price/currency", () => {
    const doc = html({
      "@type": "Product",
      name: "Pride Pin",
      offers: { price: "12.50", priceCurrency: "EUR" },
    });
    const item = extractJsonLd(doc, "https://shop.example/pin")[0]!;
    expect(item.entity_type).toBe("marketplace_item");
    expect(item.raw_data.price).toBe(12.5);
    expect(item.raw_data.currency).toBe("EUR");
  });

  it("does NOT copy articleBody for NewsArticle (copyright)", () => {
    const doc = html({
      "@type": "NewsArticle",
      headline: "Court rules on conversion therapy ban",
      description: "Short summary",
      articleBody: "Full copyrighted text that should not be copied …",
      datePublished: "2026-04-01",
      author: { name: "Jane Doe" },
    });
    const item = extractJsonLd(doc, "https://news.example/x")[0]!;
    expect(item.entity_type).toBe("news_article");
    expect(item.raw_data.title).toBe("Court rules on conversion therapy ban");
    expect(item.raw_data.summary).toBe("Short summary");
    expect(item.raw_data.author).toBe("Jane Doe");
    expect(item.raw_data.articleBody).toBeUndefined();
  });

  it("flattens @graph arrays", () => {
    const doc = html({
      "@graph": [
        { "@type": "Event", name: "A" },
        { "@type": "Restaurant", name: "B" },
      ],
    });
    const items = extractJsonLd(doc, "https://x");
    expect(items.map((i) => i.entity_type).sort()).toEqual(["event", "venue"]);
  });

  it("ignores unknown @types", () => {
    const doc = html({ "@type": "WebPage", name: "Home" });
    expect(extractJsonLd(doc, "https://x")).toHaveLength(0);
  });

  it("unwraps ItemList.itemListElement[].item — listing pages return all events, not just a wrapper", () => {
    const doc = html({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, item: { "@type": "Event", name: "A", url: "https://x/a" } },
        { "@type": "ListItem", position: 2, item: { "@type": "Event", name: "B", url: "https://x/b" } },
        { "@type": "ListItem", position: 3, item: { "@type": "Event", name: "C", url: "https://x/c" } },
      ],
    });
    const items = extractJsonLd(doc, "https://x");
    expect(items.map((i) => i.raw_data.name).sort()).toEqual(["A", "B", "C"]);
  });

  it("unwraps Festival.subEvent[] into individual events", () => {
    const doc = html({
      "@type": "Festival",
      name: "Pride Week",
      subEvent: [
        { "@type": "Event", name: "Drag Brunch", url: "https://x/1" },
        { "@type": "Event", name: "Block Party", url: "https://x/2" },
      ],
    });
    const items = extractJsonLd(doc, "https://x");
    const names = items.map((i) => i.raw_data.name).sort();
    expect(names).toContain("Drag Brunch");
    expect(names).toContain("Block Party");
  });
});
