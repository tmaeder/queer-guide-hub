import { useState } from "react";
import { enrichItem, type ExistingMatch } from "../shared/api";
import { getValidAccessToken } from "../shared/auth";
import type { DetectedItem } from "../shared/types";

const TABLE_PATH: Record<ExistingMatch["table"], string> = {
  venues: "venues",
  events: "events",
  news_articles: "news",
};

function existingUrl(match: ExistingMatch): string {
  return match.slug
    ? `https://queer.guide/${TABLE_PATH[match.table]}/${match.slug}`
    : `https://queer.guide/${TABLE_PATH[match.table]}/${match.id}`;
}

const EDITABLE_FIELDS_BY_TYPE: Record<string, string[]> = {
  venue: ["name", "description", "address", "city", "country", "url"],
  event: ["title", "description", "start_date", "end_date", "venue_name", "city", "url"],
  stay: ["name", "description", "address", "city", "country", "url"],
  marketplace_item: ["title", "description", "price", "currency", "url"],
  news_article: ["title", "summary", "author", "published_at", "url"],
  place: ["name", "description", "address", "city", "country", "url"],
  organization: ["name", "description", "url"],
};

const TYPE_LABEL: Record<string, string> = {
  venue: "Venue",
  event: "Event",
  stay: "Hotel",
  marketplace_item: "Marketplace",
  news_article: "News",
  place: "Place",
  organization: "Org",
};

export function ItemCard({
  item,
  existing,
  onSubmit,
}: {
  item: DetectedItem;
  existing?: ExistingMatch | null;
  onSubmit: (edited: Record<string, unknown>) => void | Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const fields = EDITABLE_FIELDS_BY_TYPE[item.entity_type] ?? ["name", "description", "url"];
  const display = { ...item.raw_data, ...edits };
  const conf = item.confidence;
  const confClass = conf >= 0.7 ? "hi" : conf < 0.4 ? "lo" : "";

  async function runEnrich() {
    const token = await getValidAccessToken();
    if (!token) { setEnrichError("not signed in"); return; }
    setEnriching(true); setEnrichError(null);
    try {
      const out = await enrichItem(
        item.source_url,
        String(display.title ?? display.name ?? ""),
        String(display.description ?? display.summary ?? ""),
        token,
      );
      const next: Record<string, unknown> = { ...edits, summary: out.summary };
      if (out.suggested_tags.length) {
        const existing = Array.isArray(display.tags) ? display.tags as string[] : [];
        next.tags = Array.from(new Set([...existing, ...out.suggested_tags]));
      }
      setEdits(next);
      setOpen(true);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "failed");
    } finally { setEnriching(false); }
  }

  return (
    <div className="qg-item">
      <div className="qg-item-head">
        <span className="qg-type">{TYPE_LABEL[item.entity_type] ?? item.entity_type}</span>
        <span className={`qg-confidence ${confClass}`}>{Math.round(conf * 100)}%</span>
      </div>
      {existing && (
        <div className="qg-existing">
          <span>Already in queer.guide:</span>{" "}
          <a href={existingUrl(existing)} target="_blank" rel="noreferrer">{existing.title}</a>
        </div>
      )}
      <div className="qg-name">{String(display.name ?? display.title ?? "(unnamed)")}</div>
      <div className="qg-meta">
        {String(display.address ?? display.city ?? display.summary ?? "").slice(0, 120)}
      </div>
      {open && (
        <div className="qg-edit">
          {fields.map((f) => (
            <div key={f}>
              <label>{f}</label>
              <input
                value={String(display[f] ?? "")}
                onChange={(e) => setEdits({ ...edits, [f]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
      {enrichError && <div className="qg-toast err">{enrichError}</div>}
      <div className="qg-actions">
        <button onClick={runEnrich} disabled={enriching} title="AI summary + tags">
          {enriching ? "✨ …" : "✨ AI"}
        </button>
        <button onClick={() => setOpen((v) => !v)}>{open ? "close" : "edit"}</button>
        <button
          className="primary"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try { await onSubmit(edits); } finally { setSubmitting(false); }
          }}
        >
          {submitting ? "submitting…" : existing ? "submit anyway" : "submit"}
        </button>
      </div>
    </div>
  );
}
