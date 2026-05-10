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

  it("captures price + currency from text", () => {
    const doc = html("<h1>Pride Pin</h1><p>Only €12.50</p>");
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.raw_data.price).toBe(12.5);
    expect(item.raw_data.currency).toBe("EUR");
  });

  it("recognises CHF + USD + GBP + JPY symbols", () => {
    for (const [text, expected] of [
      ["CHF 80.00", "CHF"],
      ["$45", "USD"],
      ["£25", "GBP"],
      ["¥1000", "JPY"],
    ] as const) {
      const item = extractDomHeuristics(html(`<h1>X</h1><p>${text}</p>`), "https://x")[0]!;
      expect(item.raw_data.currency).toBe(expected);
    }
  });

  it("falls back to ISO date in body when no <time>", () => {
    const item = extractDomHeuristics(
      html("<h1>Event</h1><p>On 2026-07-25 in Berlin.</p>"),
      "https://x",
    )[0]!;
    expect(item.raw_data.start_date).toBe("2026-07-25");
  });

  it("prefers <time datetime> over body text", () => {
    const item = extractDomHeuristics(
      html(`<h1>X</h1><time datetime="2026-08-01T20:00">Aug 1</time>`),
      "https://x",
    )[0]!;
    expect(item.raw_data.start_date).toBe("2026-08-01T20:00");
  });

  it("captures tel:/mailto: contact links", () => {
    const item = extractDomHeuristics(
      html(`<h1>X</h1><a href="tel:+4930123456">call</a><a href="mailto:hi@x.de">mail</a>`),
      "https://x",
    )[0]!;
    expect(item.raw_data.phone).toBe("+4930123456");
    expect(item.raw_data.email).toBe("hi@x.de");
  });

  it("falls back to postcode + city when no <address>", () => {
    const item = extractDomHeuristics(
      html("<h1>Café</h1><p>Visit us at 12345 Berlin.</p>"),
      "https://x",
    )[0]!;
    expect(item.raw_data.address).toContain("Berlin");
  });

  it("infers entity_type=event when both date and price are present", () => {
    // Note: surround the date with whitespace so the textContent concat
    // across block elements doesn't run "Concert" into "2026" (which
    // breaks the `\b` boundary in ISO_DATE_PATTERN).
    const doc = html("<h1>Pride Concert</h1><p>On 2026-07-25 – €25</p>");
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.entity_type).toBe("event");
  });

  it("infers entity_type=marketplace_item when price is present without a date", () => {
    const doc = html("<h1>Pride Pin</h1><p>€12.50</p>");
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.entity_type).toBe("marketplace_item");
  });

  it("infers entity_type=venue when address is present without a date", () => {
    const doc = html("<h1>Café SchwuZ</h1><address>Rollbergstr 26, Berlin</address>");
    const item = extractDomHeuristics(doc, "https://x")[0]!;
    expect(item.entity_type).toBe("venue");
  });

  it("infers entity_type=stay from hotel slug in URL", () => {
    const doc = html("<h1>Axel Hotel</h1><address>Lietzenburger Str. Berlin</address>");
    const item = extractDomHeuristics(doc, "https://example.com/hotels/axel-berlin")[0]!;
    expect(item.entity_type).toBe("stay");
  });

  it("returns nothing when only an h1 + description are present (no real signals)", () => {
    const doc = html(' <h1>Hello</h1><meta name="description" content="A page">');
    expect(extractDomHeuristics(doc, "https://x")).toHaveLength(0);
  });
});
