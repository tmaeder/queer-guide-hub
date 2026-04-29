import { describe, expect, it } from "vitest";
import { ALLOWED, buildSubmissionRow } from "../src/supabase";

const venueBody = {
  entity_type: "venue" as const,
  raw_data: { name: "X", city: "Berlin" },
  source_url: "https://example.com/x",
  client: "extension/0.4.0",
  extraction_method: "jsonld" as const,
};

describe("buildSubmissionRow", () => {
  it("produces values inside the DB check-constraint allowlists", () => {
    const row = buildSubmissionRow({ userId: "u-1", body: venueBody });
    expect(ALLOWED.feedback_status).toContain(row.feedback_status);
    expect(ALLOWED.sub_source_type).toContain(row.sub_source_type);
    expect(ALLOWED.platform).toContain(row.platform);
    expect(ALLOWED.media_processing_status).toContain(row.media_processing_status);
  });

  it("flags media as 'pending' when raw_data.images is set, 'not_applicable' otherwise", () => {
    const withImg = buildSubmissionRow({
      userId: "u-1",
      body: { ...venueBody, raw_data: { ...venueBody.raw_data, images: ["https://x/y.png"] } },
    });
    expect(withImg.media_processing_status).toBe("pending");
    expect(withImg.media_urls).toEqual(["https://x/y.png"]);

    const noImg = buildSubmissionRow({ userId: "u-1", body: venueBody });
    expect(noImg.media_processing_status).toBe("not_applicable");
    expect(noImg.media_urls).toBeNull();
  });

  it("forwards client + extraction_method + notes into submitter_metadata", () => {
    const row = buildSubmissionRow({
      userId: "u-1",
      body: { ...venueBody, notes: "test note" },
      userAgent: "Mozilla/5.0",
    });
    expect(row.submitter_metadata).toEqual({
      client: "extension/0.4.0",
      extraction_method: "jsonld",
      field_confidence: null,
      user_notes: "test note",
      ua: "Mozilla/5.0",
    });
  });

  it("maps entity_type onto the content_type taxonomy", () => {
    for (const [entity, content] of [
      ["venue", "venue"],
      ["event", "event"],
      ["stay", "stay"],
      ["marketplace_item", "marketplace"],
      ["news_article", "news"],
      ["organization", "organization"],
      ["place", "place"],
    ] as const) {
      const row = buildSubmissionRow({
        userId: "u-1",
        body: { ...venueBody, entity_type: entity },
      });
      expect(row.content_type).toBe(content);
    }
  });

  it("threads submitted_by from userId", () => {
    const row = buildSubmissionRow({ userId: "abc-123", body: venueBody });
    expect(row.submitted_by).toBe("abc-123");
  });
});
