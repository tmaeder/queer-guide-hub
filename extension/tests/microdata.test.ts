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
    expect(item.raw_data.startDate).toBe("2026-07-25T14:00");
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
});
