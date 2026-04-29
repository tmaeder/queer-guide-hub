import { describe, expect, it } from "vitest";
import { extractMicrodata } from "../src/shared/extractors/microdata";

function html(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, "text/html");
}

describe("microdata extractor", () => {
  it("reads a Restaurant scope", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Restaurant">
        <h1 itemprop="name">Café SchwuZ</h1>
        <span itemprop="description">Queer café in Neukölln</span>
        <a itemprop="url" href="https://example.com/cafe">link</a>
      </div>`);
    const items = extractMicrodata(doc, "https://x");
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.entity_type).toBe("venue");
    expect(item.raw_data.name).toBe("Café SchwuZ");
    expect(item.raw_data.url).toBe("https://example.com/cafe");
  });

  it("reads <meta content> and <time datetime>", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Event">
        <meta itemprop="name" content="Pride Parade">
        <time itemprop="startDate" datetime="2026-07-25T14:00">July 25</time>
      </div>`);
    const item = extractMicrodata(doc, "https://x")[0]!;
    expect(item.entity_type).toBe("event");
    expect(item.raw_data.name).toBe("Pride Parade");
    expect(item.raw_data.start_date).toBe("2026-07-25T14:00");
  });

  it("ignores unknown itemtype", () => {
    const doc = html(`<div itemscope itemtype="https://schema.org/WebPage"><span itemprop="name">x</span></div>`);
    expect(extractMicrodata(doc, "https://x")).toHaveLength(0);
  });

  it("handles multiple sibling scopes", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Restaurant"><span itemprop="name">A</span></div>
      <div itemscope itemtype="https://schema.org/Hotel"><span itemprop="name">B</span></div>`);
    const items = extractMicrodata(doc, "https://x");
    expect(items.map((i) => i.entity_type).sort()).toEqual(["stay", "venue"]);
  });

  it("flattens nested address itemscope into postal_code/city/country on the parent", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Restaurant">
        <span itemprop="name">SchwuZ</span>
        <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
          <span itemprop="streetAddress">Rollbergstr 26</span>
          <span itemprop="addressLocality">Berlin</span>
          <span itemprop="postalCode">12053</span>
          <span itemprop="addressCountry">DE</span>
        </div>
      </div>`);
    const item = extractMicrodata(doc, "https://x")[0]!;
    expect(item.raw_data.address).toBe("Rollbergstr 26");
    expect(item.raw_data.city).toBe("Berlin");
    expect(item.raw_data.postal_code).toBe("12053");
    expect(item.raw_data.country).toBe("DE");
  });

  it("captures multiple Offer scopes as price_min/price_max on the parent Event", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Event">
        <span itemprop="name">Pride Concert</span>
        <time itemprop="startDate" datetime="2026-07-26T20:00">Jul 26</time>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="price" content="0">
          <meta itemprop="priceCurrency" content="EUR">
        </div>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="price" content="25">
          <meta itemprop="priceCurrency" content="EUR">
          <link itemprop="url" href="https://x/early">
        </div>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="price" content="40">
          <meta itemprop="priceCurrency" content="EUR">
        </div>
      </div>`);
    const item = extractMicrodata(doc, "https://x")[0]!;
    expect(item.raw_data.is_free).toBe(true);
    expect(item.raw_data.price_min).toBe(0);
    expect(item.raw_data.price_max).toBe(40);
    expect(item.raw_data.ticket_url).toBe("https://x/early");
  });

  it("does not leak nested Place fields into the parent Event's flat property bag", () => {
    const doc = html(`
      <div itemscope itemtype="https://schema.org/Event">
        <span itemprop="name">Drag Brunch</span>
        <div itemprop="location" itemscope itemtype="https://schema.org/Place">
          <span itemprop="name">SchwuZ</span>
          <span itemprop="telephone">+4930123456</span>
        </div>
      </div>`);
    const item = extractMicrodata(doc, "https://x")[0]!;
    // Event picks up venue_name from the nested Place …
    expect(item.raw_data.venue_name).toBe("SchwuZ");
    // … but the Place's `telephone` does NOT leak onto the Event.
    expect(item.raw_data.phone).toBeUndefined();
    expect(item.raw_data.telephone).toBeUndefined();
  });
});
