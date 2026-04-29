import { describe, expect, it } from "vitest";
import { extractOpenGraph } from "../src/shared/extractors/opengraph";

function html(meta: Record<string, string>): Document {
  const tags = Object.entries(meta)
    .map(([k, v]) => `<meta property="${k}" content="${v}">`)
    .join("");
  return new DOMParser().parseFromString(`<html><head>${tags}</head><body></body></html>`, "text/html");
}

describe("opengraph extractor", () => {
  it("maps og:type=event", () => {
    const doc = html({
      "og:type": "event",
      "og:title": "Drag Brunch",
      "og:url": "https://e.example/drag",
      "event:start_time": "2026-05-10T11:00",
    });
    const item = extractOpenGraph(doc, "https://e.example/drag")[0]!;
    expect(item.entity_type).toBe("event");
    expect(item.raw_data.title).toBe("Drag Brunch");
    expect(item.raw_data.start_date).toBe("2026-05-10T11:00");
  });

  it("maps og:type=product with price/currency", () => {
    const doc = html({
      "og:type": "product",
      "og:title": "Pride Tee",
      "product:price:amount": "29.90",
      "product:price:currency": "USD",
    });
    const item = extractOpenGraph(doc, "https://shop.example/x")[0]!;
    expect(item.entity_type).toBe("marketplace_item");
    expect(item.raw_data.price).toBe(29.9);
    expect(item.raw_data.currency).toBe("USD");
  });

  it("returns nothing when og:type is unknown", () => {
    const doc = html({ "og:type": "website", "og:title": "Hi" });
    expect(extractOpenGraph(doc, "https://x")).toHaveLength(0);
  });

  it("article maps to news_article and folds description into summary", () => {
    const doc = html({
      "og:type": "article",
      "og:title": "News",
      "og:description": "Lead text",
      "article:published_time": "2026-04-01",
    });
    const item = extractOpenGraph(doc, "https://n.example/x")[0]!;
    expect(item.entity_type).toBe("news_article");
    expect(item.raw_data.summary).toBe("Lead text");
    expect(item.raw_data.description).toBeUndefined();
  });

  it("platform fallback: Substack post (og:type=website) → news_article", () => {
    const doc = html({
      "og:type": "website",
      "og:site_name": "QueerStack",
      "og:title": "Why Berlin queer scene is shifting",
    });
    const item = extractOpenGraph(doc, "https://queerstack.substack.com/p/why-berlin")[0]!;
    expect(item.entity_type).toBe("news_article");
  });

  it("platform fallback: Bandcamp release → marketplace_item", () => {
    const doc = html({
      "og:type": "website",
      "og:site_name": "Bandcamp",
      "og:title": "Pride Anthem EP",
    });
    const item = extractOpenGraph(doc, "https://artist.bandcamp.com/album/pride-anthem-ep")[0]!;
    expect(item.entity_type).toBe("marketplace_item");
  });

  it("platform fallback: Airbnb listing → stay", () => {
    const doc = html({
      "og:type": "website",
      "og:site_name": "Airbnb",
      "og:title": "Cosy loft in Kreuzberg",
    });
    const item = extractOpenGraph(doc, "https://www.airbnb.com/rooms/12345")[0]!;
    expect(item.entity_type).toBe("stay");
  });

  it("platform fallback only fires for generic og:type=website, not specific types", () => {
    const doc = html({
      "og:type": "article",
      "og:site_name": "Substack",
      "og:title": "X",
    });
    const item = extractOpenGraph(doc, "https://x.substack.com/p/y")[0]!;
    // og:type=article wins → news_article (not platform inference)
    expect(item.entity_type).toBe("news_article");
  });
});
