import { useState } from "react";
import type { DetectedItem } from "../shared/types";

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
  onSubmit,
}: {
  item: DetectedItem;
  onSubmit: (edited: Record<string, unknown>) => void | Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fields = EDITABLE_FIELDS_BY_TYPE[item.entity_type] ?? ["name", "description", "url"];
  const display = { ...item.raw_data, ...edits };
  const conf = item.confidence;
  const confClass = conf >= 0.7 ? "hi" : conf < 0.4 ? "lo" : "";

  return (
    <div className="qg-item">
      <div className="qg-item-head">
        <span className="qg-type">{TYPE_LABEL[item.entity_type] ?? item.entity_type}</span>
        <span className={`qg-confidence ${confClass}`}>{Math.round(conf * 100)}%</span>
      </div>
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
      <div className="qg-actions">
        <button onClick={() => setOpen((v) => !v)}>{open ? "close" : "edit"}</button>
        <button
          className="primary"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try { await onSubmit(edits); } finally { setSubmitting(false); }
          }}
        >
          {submitting ? "submitting…" : "submit"}
        </button>
      </div>
    </div>
  );
}
