/**
 * Integration tests against realistic HTML fixtures resembling Eventbrite,
 * Booking.com, Etsy, Patroc, and a generic news page. Validates the full
 * extractor pipeline (extractAll) end-to-end.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractAll } from "../src/shared/extractors";

function load(name: string): Document {
  const path = join(__dirname, "fixtures", name);
  const html = readFileSync(path, "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("fixture: eventbrite-event", () => {
  it("detects an event with date and venue", () => {
    const items = extractAll(load("eventbrite-event.html"), "https://eventbrite.com/x");
    const event = items.find((i) => i.entity_type === "event");
    expect(event).toBeDefined();
    expect(event!.raw_data.name).toBe("Drag Brunch SO36");
    expect(event!.raw_data.start_date).toBe("2026-05-10T11:00:00+02:00");
    expect(event!.raw_data.venue_name).toBe("SO36");
    expect(event!.extraction_method).toBe("jsonld");
  });
});

describe("fixture: booking-hotel", () => {
  it("detects a stay with geo coords", () => {
    const items = extractAll(load("booking-hotel.html"), "https://booking.com/x");
    const stay = items.find((i) => i.entity_type === "stay");
    expect(stay).toBeDefined();
    expect(stay!.raw_data.name).toBe("Axel Hotel Berlin");
    expect(stay!.raw_data.latitude).toBe(52.4994);
    expect(stay!.raw_data.longitude).toBe(13.3406);
  });
});

describe("fixture: etsy-product", () => {
  it("detects a marketplace_item with price/currency", () => {
    const items = extractAll(load("etsy-product.html"), "https://etsy.com/listing/x");
    const product = items.find((i) => i.entity_type === "marketplace_item");
    expect(product).toBeDefined();
    expect(product!.raw_data.price).toBe(12.5);
    expect(product!.raw_data.currency).toBe("EUR");
  });
});

describe("fixture: news-article", () => {
  it("detects news without copying articleBody", () => {
    const items = extractAll(load("news-article.html"), "https://tagesschau.de/x");
    const news = items.find((i) => i.entity_type === "news_article");
    expect(news).toBeDefined();
    expect(news!.raw_data.title).toBe("Court rules on conversion therapy ban");
    expect(news!.raw_data.summary).toBe("Constitutional court upheld the 2024 ban.");
    expect(news!.raw_data.author).toBe("Jane Doe");
    expect(news!.raw_data.articleBody).toBeUndefined();
    expect(JSON.stringify(news!.raw_data)).not.toContain("FULL COPYRIGHTED");
  });
});

describe("fixture: patroc-venue", () => {
  it("detects a venue from microdata even with weak OG type", () => {
    const items = extractAll(load("patroc-venue.html"), "https://patroc.com/berlin/venue/schwuz");
    const venue = items.find((i) => i.entity_type === "venue");
    expect(venue).toBeDefined();
    expect(venue!.raw_data.name).toBe("SchwuZ");
    expect(venue!.extraction_method).toBe("microdata");
  });
});
