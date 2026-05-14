import { describe, expect, it } from "vitest";
import { extractDomHeuristics } from "../src/shared/extractors/dom-heuristics";

function html(body: string): Document {
  const doc = document.implementation.createHTMLDocument("test");
  doc.body.innerHTML = body;
  return doc;
}

describe("dom heuristics", () => {
  it("returns nothing when there is no h1", () => {
    expect(extractDomHeuristics(html("<p>x</p>"), "https://x")).toHaveLength(0);
  });

  it("extracts name from h1", () => {
    const item = extractDomHeuristics(html("<h1>Pride Pin</h1><p>Only €12.50</p>"), "https://x")[0]!;
    expect(item.raw_data.name).toBe("Pride Pin");
    expect(item.raw_data.title).toBe("Pride Pin");
  });

  it("captures price_text from body text", () => {
    const doc = html("<h1>Pride Pin</h1><p>Only €12.50</p>");
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.raw_data.price_text).toBe("€12.50");
  });

  it.todo("captures price + currency from text");
  it.todo("recognises CHF + USD + GBP + JPY symbols");

  it.todo("falls back to ISO date in body when no <time>");

  it("prefers <time datetime> over body text", () => {
    const item = extractDomHeuristics(
      html(`<h1>X</h1><time datetime="2026-08-01T20:00">Aug 1</time>`),
      "https://x",
    )[0]!;
    expect(item.raw_data.start_date).toBe("2026-08-01T20:00");
  });

  it.todo("captures tel:/mailto: contact links");

  it("extracts address from <address> element", () => {
    const item = extractDomHeuristics(
      html("<h1>Café</h1><address>12345 Berlin</address>"),
      "https://x",
    )[0]!;
    expect(item.raw_data.address).toContain("Berlin");
  });

  it.todo("falls back to postcode + city when no <address>");
  it.todo("infers entity_type=event when both date and price are present");
  it.todo("infers entity_type=marketplace_item when price is present without a date");
  it.todo("infers entity_type=venue when address is present without a date");
  it.todo("infers entity_type=stay from hotel slug in URL");

  it("returns entity_type=place by default", () => {
    const item = extractDomHeuristics(html("<h1>Test</h1>"), "https://x")[0]!;
    expect(item.entity_type).toBe("place");
    expect(item.extraction_method).toBe("dom");
    expect(item.confidence).toBe(0.3);
  });

  it("captures description from meta tag", () => {
    const doc = html('<h1>Hello</h1><meta name="description" content="A page">');
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.raw_data.description).toBe("A page");
  });

  it("sets source_url from argument", () => {
    const item = extractDomHeuristics(html("<h1>X</h1>"), "https://example.com")[0]!;
    expect(item.raw_data.url).toBe("https://example.com");
    expect(item.source_url).toBe("https://example.com");
  });
});
