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

  it("resolves @id references — Event.location pointing to a separate Place node", () => {
    const doc = html({
      "@graph": [
        {
          "@type": "Event",
          name: "Drag Brunch",
          startDate: "2026-05-10T11:00",
          location: { "@id": "#schwuz" },
        },
        {
          "@id": "#schwuz",
          "@type": "Place",
          name: "SchwuZ",
          address: { streetAddress: "Rollbergstr 26", addressLocality: "Berlin" },
        },
      ],
    });
    const items = extractJsonLd(doc, "https://x");
    // Event keeps its venue_name from the resolved Place; standalone Place
    // is NOT surfaced as a separate orphan item.
    const events = items.filter((i) => i.entity_type === "event");
    expect(events).toHaveLength(1);
    expect(events[0]!.raw_data.venue_name).toBe("SchwuZ");
    expect(items.filter((i) => i.entity_type === "place")).toHaveLength(0);
  });

  it("extracts venue contact info — phone, email, instagram, postal_code, price_range", () => {
    const doc = html({
      "@type": "Restaurant",
      name: "Café SchwuZ",
      telephone: "+49 30 1234567",
      email: "info@schwuz.de",
      priceRange: "€€",
      sameAs: ["https://instagram.com/schwuz_official", "https://twitter.com/schwuz"],
      address: {
        streetAddress: "Rollbergstr 26",
        addressLocality: "Berlin",
        postalCode: "12053",
      },
    });
    const item = extractJsonLd(doc, "https://x")[0]!;
    expect(item.raw_data.phone).toBe("+49 30 1234567");
    expect(item.raw_data.email).toBe("info@schwuz.de");
    expect(item.raw_data.instagram).toBe("schwuz_official");
    expect(item.raw_data.price_range).toBe("€€");
    expect(item.raw_data.postal_code).toBe("12053");
  });

  it("extracts event ticket_url, price_min/max, is_free across multiple offers", () => {
    const doc = html({
      "@type": "Event",
      name: "Pride Concert",
      startDate: "2026-07-26T20:00",
      offers: [
        { "@type": "Offer", price: "0", priceCurrency: "EUR", url: "https://x/free" },
        { "@type": "Offer", price: "25", priceCurrency: "EUR", url: "https://x/early" },
        { "@type": "Offer", price: "40", priceCurrency: "EUR", url: "https://x/door" },
      ],
    });
    const item = extractJsonLd(doc, "https://x")[0]!;
    expect(item.raw_data.is_free).toBe(true);
    expect(item.raw_data.price_min).toBe(0);
    expect(item.raw_data.price_max).toBe(40);
    expect(item.raw_data.currency).toBe("EUR");
    expect(item.raw_data.ticket_url).toBe("https://x/free");
  });

  it("extracts product business_name from brand and shipping_available", () => {
    const doc = html({
      "@type": "Product",
      name: "Pride T-Shirt",
      brand: { "@type": "Brand", name: "QueerGuide Shop" },
      offers: {
        "@type": "Offer",
        price: "29.99",
        priceCurrency: "USD",
        shippingDetails: { "@type": "OfferShippingDetails" },
      },
    });
    const item = extractJsonLd(doc, "https://x")[0]!;
    expect(item.raw_data.business_name).toBe("QueerGuide Shop");
    expect(item.raw_data.shipping_available).toBe(true);
  });

  it("extracts hotel amenities and price_range", () => {
    const doc = html({
      "@type": "Hotel",
      name: "Axel Hotel Berlin",
      priceRange: "$$$",
      amenityFeature: [
        { "@type": "LocationFeatureSpecification", name: "Free WiFi" },
        { "@type": "LocationFeatureSpecification", name: "Pool" },
        { "@type": "LocationFeatureSpecification", name: "Gym" },
      ],
    });
    const item = extractJsonLd(doc, "https://x")[0]!;
    expect(item.raw_data.amenities).toEqual(["Free WiFi", "Pool", "Gym"]);
    expect(item.raw_data.price_range).toBe("$$$");
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
