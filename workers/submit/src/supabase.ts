import type { SubmitBody } from "./schema";

export interface InsertResult {
  id: string;
  status: string;
}

/**
 * Mirrors of the CHECK constraints on `community_submissions`. Kept in
 * sync manually with the DB; the `buildSubmissionRow` test asserts every
 * enum-valued field we emit is in the corresponding set so a constraint
 * mismatch can't ship to production again (PR #152 was caused by exactly
 * that — the worker shipped 'open' / 'extension' values that the DB
 * rejected, with no test coverage to catch it).
 */
export const ALLOWED = {
  feedback_status: ["new", "under_review", "planned", "in_progress", "done"] as const,
  sub_source_type: ["api", "webhook", "manual", "forwarded", "upload", "url_import", "scrape", "import"] as const,
  platform: ["instagram", "facebook", "x", "bluesky", "telegram", "whatsapp", "tiktok", "fetlife", "signal", "email", "manual", "admin", "flyer", "web", "other"] as const,
  media_processing_status: ["pending", "processing", "done", "partial", "failed", "skipped", "not_applicable"] as const,
  sensitivity_level: ["public", "semi_public", "community", "private"] as const,
  permission_level: ["public_share", "submitter_consent", "community_only", "do_not_publish"] as const,
};

export interface BuildRowOpts {
  userId: string;
  body: SubmitBody;
  userAgent?: string;
}

/**
 * Pure function that builds the row sent to `/rest/v1/community_submissions`.
 * Pulled out so unit tests can assert the row shape against ALLOWED without
 * needing a Supabase round-trip.
 */
export function buildSubmissionRow(opts: BuildRowOpts) {
  const images = readImages(opts.body.raw_data);
  return {
    content_type: mapEntityToContentType(opts.body.entity_type),
    status: "pending",
    feedback_status: "new" as const,
    data: opts.body.raw_data,
    submitted_by: opts.userId,
    source_url: opts.body.source_url,
    media_urls: images.length ? images : null,
    media_processing_status: (images.length ? "pending" : "not_applicable") as
      typeof ALLOWED.media_processing_status[number],
    sub_source_type: "url_import" as const,
    platform: "web" as const,
    submitter_metadata: {
      client: opts.body.client ?? null,
      extraction_method: opts.body.extraction_method ?? null,
      field_confidence: opts.body.field_confidence ?? null,
      user_notes: opts.body.notes ?? null,
      ua: opts.userAgent ?? null,
    },
  };
}

/**
 * Insert into community_submissions — the canonical user-submission table.
 * The existing `source-community-submissions` edge function picks pending
 * rows up and stages them into ingestion_staging, where the rest of the
 * pipeline (normalize → media-process → dedupe → quality → review-gate →
 * commit) takes over.
 *
 * RLS handles authorization: the policy "Users can create submissions"
 * requires `submitted_by = auth.uid()`, so the worker forwards the user's
 * JWT instead of using the service role.
 */
export async function insertSubmission(opts: {
  supabaseUrl: string;
  userJwt: string;
  anonKey: string;
  userId: string;
  body: SubmitBody;
  userAgent?: string;
}): Promise<InsertResult> {
  const row = buildSubmissionRow({
    userId: opts.userId,
    body: opts.body,
    userAgent: opts.userAgent,
  });

  const url = `${opts.supabaseUrl}/rest/v1/community_submissions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: opts.anonKey,
      Authorization: `Bearer ${opts.userJwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`supabase insert failed ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{ id: string; status: string }>;
  if (!data.length) throw new Error("supabase returned empty result");
  return data[0]!;
}

export async function getSubmissionStatus(opts: {
  supabaseUrl: string;
  userJwt: string;
  anonKey: string;
  id: string;
}): Promise<Record<string, unknown> | null> {
  const url =
    `${opts.supabaseUrl}/rest/v1/community_submissions` +
    `?id=eq.${encodeURIComponent(opts.id)}` +
    `&select=id,content_type,status,feedback_status,media_processing_status,promoted_to_id,promoted_to_table,submitted_at,reviewed_at,reviewer_notes`;
  const res = await fetch(url, {
    headers: {
      apikey: opts.anonKey,
      Authorization: `Bearer ${opts.userJwt}`,
    },
  });
  if (!res.ok) {
    throw new Error(`supabase select failed ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

function mapEntityToContentType(t: string): string {
  switch (t) {
    case "venue":
      return "venue";
    case "event":
      return "event";
    case "stay":
      return "stay";
    case "marketplace_item":
      return "marketplace";
    case "news_article":
      return "news";
    case "organization":
      return "organization";
    default:
      return "place";
  }
}

function readImages(raw: Record<string, unknown>): string[] {
  const v = raw["images"];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}
