import { describe, expect, it } from "vitest";
import { extractDomHeuristics } from "../src/shared/extractors/dom-heuristics";

function html(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, "text/html");
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
});
