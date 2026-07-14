/**
 * useFlyerScan — Manages flyer scan lifecycle: upload → analyze → map to form fields.
 * Supports multiple files and multiple items per file.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isAcceptedFile } from '@/lib/fileExtractors';
import { extractFileContent } from '@/lib/extractFileContent';
import { uploadImageToR2 } from '@/lib/uploadImageToR2';
import {
  validateFile,
  toUploadError,
  makeUploadError,
  logUploadError,
  type UploadError,
} from '@/lib/uploadErrors';
import { normalizeAndValidateUrl } from '@/utils/url';

/**
 * Recover the real HTTP status + error message from a Supabase `FunctionsHttpError`.
 * `invoke` only exposes a generic message; the edge function's `{ error }` body and
 * status code live on `error.context` (the Response). Without this, every analyze
 * failure collapses to a generic 500 "our side" message.
 */
async function enrichFnError(fnError: unknown): Promise<Error & { status?: number }> {
  const ctx = (fnError as { context?: Response }).context;
  let status: number | undefined;
  let message: string | undefined;
  if (ctx && typeof ctx.status === 'number') {
    status = ctx.status;
    try {
      const body = await ctx.clone().json();
      message = body?.error || body?.message;
    } catch {
      /* non-JSON body — keep the generic message */
    }
  }
  const err = new Error(message || (fnError as Error)?.message || 'analyze failed') as Error & {
    status?: number;
  };
  err.status = status;
  return err;
}

/** Keep scanned URLs only when they validate; otherwise drop to avoid pre-filling garbage. */
function safeScannedUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const result = normalizeAndValidateUrl(value);
  return result.ok ? result.value : undefined;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedField {
  value: unknown;
  confidence: number;
  source: string;
}

export interface VenueCandidate {
  id: string;
  name: string;
  score: number;
  address: string;
  city: string;
  city_id: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type DetectedType = 'event' | 'venue' | 'hotel' | 'news' | 'marketplace';

export interface TagSuggestion {
  slug: string;
  label: string;
  confidence: number;
  source: 'vocab' | 'extracted' | 'marker';
  preselected: boolean;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  score: number;
  type: DetectedType;
  city?: string | null;
}

export interface FlyerScanItem {
  detected_type: DetectedType;
  fields: Record<string, ExtractedField>;
  tag_suggestions?: TagSuggestion[];
  matches: {
    venue_candidates: VenueCandidate[];
    city: { id: string; name: string } | null;
    country: { id: string; name: string } | null;
    duplicates?: DuplicateMatch[];
    // Back-compat (older responses): superseded by `duplicates`.
    duplicate_events: Array<{ id: string; title: string; start_date: string; score: number }>;
    duplicate_venues: Array<{ id: string; name: string; score: number }>;
  };
}

/** content_type values match the submissionRegistry ids the manual form uses. */
export const CONTENT_TYPE_BY_DETECTED: Record<DetectedType, string> = {
  event: 'event',
  venue: 'venue',
  hotel: 'hotel',
  news: 'news',
  marketplace: 'product',
};

/** Target table for an enrich link, by the matched duplicate's type. */
export const TABLE_BY_DETECTED: Record<DetectedType, string> = {
  event: 'events',
  venue: 'venues',
  hotel: 'venues',
  news: 'news_articles',
  marketplace: 'marketplace_listings',
};

export interface BuiltSubmission {
  content_type: string;
  data: Record<string, unknown>;
  submission_intent: 'create' | 'enrich';
  proposed_link_id: string | null;
  proposed_link_table: string | null;
}

export interface FlyerScanResult {
  scan_id: string | null;
  items: FlyerScanItem[];
  raw_text: string;
  language: string;
  processing_time_ms: number;
  source_file: string;
  image_url: string | null;
}

export type ScanState = 'idle' | 'uploading' | 'analyzing' | 'results' | 'error';

// ── Hook ──────────────────────────────────────────────────────────────

export function useFlyerScan() {
  const { user } = useAuth();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [results, setResults] = useState<FlyerScanResult[]>([]);
  const [error, setError] = useState<UploadError | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const reset = useCallback(() => {
    setScanState('idle');
    setResults([]);
    setError(null);
    setCurrentFileIndex(0);
    setTotalFiles(0);
  }, []);

  const startScan = useCallback(
    async (files: File[]) => {
      if (!user) {
        const e = makeUploadError('UPLOAD_FAILED', 'sign in required');
        // Sign-in is handled upstream via AuthGate; surface generic failure copy here.
        setError(e);
        setScanState('error');
        return;
      }

      if (files.length === 0) {
        setError(makeUploadError('UNSUPPORTED_TYPE', 'no files selected'));
        setScanState('error');
        return;
      }

      // Client-side validation: size + type gate for every file.
      const validFiles: File[] = [];
      for (const f of files) {
        const ve = validateFile(f, isAcceptedFile);
        if (ve) {
          logUploadError(ve, { phase: 'validate', file: f.name });
          setError(ve);
          setScanState('error');
          return;
        }
        validFiles.push(f);
      }

      setError(null);
      setResults([]);
      setTotalFiles(validFiles.length);
      const fileErrors: UploadError[] = [];

      for (let i = 0; i < validFiles.length; i++) {
        setCurrentFileIndex(i);
        const file = validFiles[i];

        try {
          setScanState('uploading');
          const content = await extractFileContent(file);

          let body: Record<string, unknown>;
          let fileImageUrl: string | null = null;

          if (content.mode === 'image' && content.imageBlob) {
            // Upload to Cloudflare R2 (img.queer.guide) — no Supabase image hosting.
            try {
              fileImageUrl = await uploadImageToR2(content.imageBlob, 'flyer-scans');
            } catch (uploadError) {
              throw toUploadError(uploadError, { phase: 'upload' });
            }
            body = { image_url: fileImageUrl };
          } else {
            body = { text: content.text };
          }

          setScanState('analyzing');
          const { data, error: fnError } = await supabase.functions.invoke('analyze-flyer', {
            body,
          });

          if (fnError) {
            throw toUploadError(await enrichFnError(fnError), { phase: 'analyze' });
          }
          if (data?.error) {
            throw toUploadError(new Error(data.error), { phase: 'analyze' });
          }

          const scanResult: FlyerScanResult = {
            scan_id: data.scan_id,
            items: data.items || [],
            raw_text: data.raw_text || '',
            language: data.language || 'en',
            processing_time_ms: data.processing_time_ms,
            source_file: file.name,
            image_url: fileImageUrl,
          };

          setResults((prev) => [...prev, scanResult]);
        } catch (err: unknown) {
          const ue = toUploadError(err, { phase: 'analyze' });
          logUploadError(ue, { fileIndex: i, fileName: file.name });
          fileErrors.push(ue);
          if (ue.code === 'RATE_LIMITED') {
            setError(ue);
            setScanState('error');
            return;
          }
        }
      }

      // No results at all → surface the first error (or extraction-empty).
      setResults((prev) => {
        if (prev.length === 0) {
          setError(fileErrors[0] ?? makeUploadError('EXTRACTION_EMPTY', 'no results'));
          setScanState('error');
        } else {
          // Flag extraction-empty per-result handled by UI; overall state = results.
          setScanState('results');
        }
        return prev;
      });
    },
    [user],
  );

  /** Scan a pasted web link: the edge function fetches the page and extracts from its text. */
  const startUrlScan = useCallback(
    async (rawUrl: string) => {
      if (!user) {
        setError(makeUploadError('UPLOAD_FAILED', 'sign in required'));
        setScanState('error');
        return;
      }
      const normalized = normalizeAndValidateUrl(rawUrl);
      if (!normalized.ok) {
        setError(makeUploadError('UNSUPPORTED_TYPE', 'enter a valid link'));
        setScanState('error');
        return;
      }

      setError(null);
      setResults([]);
      setTotalFiles(1);
      setCurrentFileIndex(0);

      try {
        setScanState('analyzing');
        const { data, error: fnError } = await supabase.functions.invoke('analyze-flyer', {
          body: { page_url: normalized.value },
        });
        if (fnError) throw toUploadError(await enrichFnError(fnError), { phase: 'analyze' });
        if (data?.error) throw toUploadError(new Error(data.error), { phase: 'analyze' });

        const scanResult: FlyerScanResult = {
          scan_id: data.scan_id,
          items: data.items || [],
          raw_text: data.raw_text || '',
          language: data.language || 'en',
          processing_time_ms: data.processing_time_ms,
          source_file: normalized.value,
          image_url: data.image_url ?? null,
        };

        if (scanResult.items.length === 0) {
          setError(makeUploadError('EXTRACTION_EMPTY', 'no results'));
          setScanState('error');
          return;
        }
        setResults([scanResult]);
        setScanState('results');
      } catch (err: unknown) {
        const ue = toUploadError(err, { phase: 'analyze' });
        logUploadError(ue, { source: 'url', url: normalized.value });
        setError(ue);
        setScanState('error');
      }
    },
    [user],
  );

  /** Build a community_submissions-ready row for one scanned item. */
  const buildRow = useCallback(
    (resultIdx: number, itemIdx: number, opts: BuildRowOpts = {}): BuiltSubmission => {
      const result = results[resultIdx];
      const item = result?.items[itemIdx];
      if (!item) return { content_type: 'event', data: {}, submission_intent: 'create', proposed_link_id: null, proposed_link_table: null };
      return buildSubmissionRow(item, { imageUrl: result.image_url, ...opts });
    },
    [results],
  );

  /** Batch-insert selected items as community_submissions (one DB round-trip). */
  const submitBatch = useCallback(
    async (
      rows: BuiltSubmission[],
    ): Promise<{
      inserted: number;
      enriched: number;
      rows: { id: string; content_type: string; title: string }[];
    }> => {
      if (!user) throw new Error('sign in required');
      if (rows.length === 0) return { inserted: 0, enriched: 0, rows: [] };
      const payload = rows.map((r) => ({
        content_type: r.content_type,
        data: r.data,
        submitted_by: user.id,
        submission_intent: r.submission_intent,
        proposed_link_id: r.proposed_link_id,
        proposed_link_table: r.proposed_link_table,
        platform: 'flyer',
        sub_source_type: 'upload',
      }));
      // `as 'venues'` mirrors useSubmission — community_submissions isn't in the
      // generated table types yet.
      const { data, error } = await supabase
        .from('community_submissions' as 'venues')
        .insert(payload as never)
        .select('id, content_type, data');
      if (error) throw error;
      const insertedRows = ((data ?? []) as unknown as {
        id: string;
        content_type: string;
        data: Record<string, unknown> | null;
      }[]).map((r) => ({
        id: r.id,
        content_type: r.content_type,
        title: ((r.data?.title ?? r.data?.name) as string | undefined) ?? r.content_type,
      }));
      return {
        inserted: rows.length,
        enriched: rows.filter((r) => r.submission_intent === 'enrich').length,
        rows: insertedRows,
      };
    },
    [user],
  );

  /** Get the total number of items across all results */
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return {
    scanState,
    results,
    totalItems,
    error,
    currentFileIndex,
    totalFiles,
    startScan,
    startUrlScan,
    reset,
    buildRow,
    submitBatch,
  };
}

// ── Pure row builder (exported for testing) ───────────────────────────

export interface BuildRowOpts {
  imageUrl?: string | null;
  /** Existing venue candidate to attach an event/venue/hotel to. */
  selectedVenueId?: string;
  /** Tag slugs the user kept; defaults to the preselected suggestions. */
  selectedTagSlugs?: string[];
  /** Link this submission as an enrichment of an existing entity. */
  enrich?: { id: string; table: string } | null;
  /** Inline field edits, applied last over the mapped data. */
  edits?: Record<string, unknown>;
  /** Override the detected type (the UI lets users re-classify an item). */
  typeOverride?: DetectedType;
}

const toNum = (v: unknown) =>
  typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));

/**
 * Map a scanned item + user choices into a `community_submissions` row.
 * `data` is shaped like the manual form values so the pipeline normalizes
 * both paths identically.
 */
export function buildSubmissionRow(item: FlyerScanItem, opts: BuildRowOpts = {}): BuiltSubmission {
  const { fields, matches } = item;
  const { selectedVenueId, imageUrl, enrich, edits } = opts;
  const type = opts.typeOverride ?? item.detected_type;
  const getVal = (key: string, minConfidence = 0.1) => {
    const f = fields[key];
    return f && f.confidence >= minConfidence ? f.value : undefined;
  };
  const data: Record<string, unknown> = {};
  const isVenueLike = type === 'venue' || type === 'hotel';

  // Attach to a selected existing venue (events/venues/hotels).
  if (selectedVenueId) {
    const venue = matches.venue_candidates.find((v) => v.id === selectedVenueId);
    if (venue) {
      if (type === 'event') data.venue_name = venue.name;
      else data.name = venue.name;
      data.address = venue.address;
      data.city = venue.city;
      if (venue.city_id) data.city_id = venue.city_id;
      if (venue.country_id) data.country_id = venue.country_id;
      if (venue.latitude) data.latitude = venue.latitude;
      if (venue.longitude) data.longitude = venue.longitude;
    }
  }

  if (type === 'event') {
    if (getVal('title')) data.title = getVal('title');
    if (getVal('description')) data.description = getVal('description');
    if (getVal('event_type')) data.event_type = getVal('event_type');
    if (getVal('start_date')) data.start_date = getVal('start_date');
    if (getVal('end_date')) data.end_date = getVal('end_date');
    if (!selectedVenueId && getVal('venue_name')) data.venue_name = getVal('venue_name');
    if (!selectedVenueId && getVal('address')) data.address = getVal('address');
    if (!selectedVenueId && getVal('city')) data.city = getVal('city');
    if (!selectedVenueId && getVal('country')) data.country = getVal('country');
    if (getVal('organizer_name')) data.organizer_name = getVal('organizer_name');
    if (getVal('organizer_contact')) data.organizer_contact = getVal('organizer_contact');
    const ticket = safeScannedUrl(getVal('ticket_url'));
    if (ticket) data.ticket_url = ticket;
    const site = safeScannedUrl(getVal('website'));
    if (site) data.website = site;
    if (getVal('is_free') !== undefined) data.is_free = getVal('is_free');

    const presale = getVal('price_presale');
    const door = getVal('price_box_office');
    const primary = presale || door;
    if (primary) {
      const n = toNum(primary);
      if (!isNaN(n) && n > 0 && n < 10000) data.price_min = n;
    }
    if (presale && door) {
      const p = toNum(presale);
      const d = toNum(door);
      if (!isNaN(p) && !isNaN(d)) {
        data.price_min = Math.min(p, d);
        data.price_max = Math.max(p, d);
      }
    }
    if (presale || door) {
      const parts: string[] = [];
      if (presale && !isNaN(toNum(presale))) parts.push(`Vorverkauf €${toNum(presale)}`);
      if (door && !isNaN(toNum(door))) parts.push(`Abendkasse €${toNum(door)}`);
      if (parts.length) {
        const note = parts.join(' / ');
        const existing = (data.description as string | undefined) ?? '';
        if (!existing.includes(note)) data.description = existing ? `${existing}\n\n${note}` : note;
      }
    }
    if (getVal('age_restriction')) data.age_restriction = getVal('age_restriction');
  } else if (isVenueLike) {
    if (!selectedVenueId && getVal('name')) data.name = getVal('name');
    if (getVal('description')) data.description = getVal('description');
    if (type === 'hotel') data.category = 'hotel';
    else if (getVal('category')) data.category = getVal('category');
    if (!selectedVenueId && getVal('address')) data.address = getVal('address');
    if (!selectedVenueId && getVal('city')) data.city = getVal('city');
    if (!selectedVenueId && getVal('country')) data.country = getVal('country');
    if (getVal('postal_code')) data.postal_code = getVal('postal_code');
    if (getVal('phone')) data.phone = getVal('phone');
    if (getVal('email')) data.email = getVal('email');
    const site = safeScannedUrl(getVal('website')) ?? safeScannedUrl(getVal('booking_url'));
    if (site) data.website = site;
    if (getVal('instagram')) data.instagram = getVal('instagram');
    if (type === 'hotel') {
      if (getVal('amenities')) data.amenities = getVal('amenities');
      if (getVal('star_rating') !== undefined) data.star_rating = getVal('star_rating');
    }
  } else if (type === 'news') {
    if (getVal('title')) data.title = getVal('title');
    if (getVal('summary')) data.summary = getVal('summary');
    if (getVal('author')) data.author = getVal('author');
    if (getVal('published_at')) data.published_at = getVal('published_at');
    if (getVal('source_name')) data.source_name = getVal('source_name');
    const url = safeScannedUrl(getVal('url'));
    if (url) data.url = url;
  } else if (type === 'marketplace') {
    if (getVal('title')) data.title = getVal('title');
    if (getVal('description')) data.description = getVal('description');
    if (getVal('brand')) data.business_name = getVal('brand');
    if (getVal('price') !== undefined) {
      const n = toNum(getVal('price'));
      if (!isNaN(n) && n > 0) data.price = n;
    }
    if (getVal('currency')) data.currency = getVal('currency');
    const url = safeScannedUrl(getVal('url'));
    if (url) data.website = url;
  }

  // Matched city/country IDs (unless they came from a selected venue).
  if (!selectedVenueId) {
    if (matches.city?.id) data.city_id = matches.city.id;
    if (matches.country?.id) data.country_id = matches.country.id;
  }

  // Tags: explicit selection, else the preselected suggestions.
  const tagSlugs = opts.selectedTagSlugs
    ?? (item.tag_suggestions ?? []).filter((t) => t.preselected).map((t) => t.slug);
  if (tagSlugs.length > 0) data.tags = tagSlugs;

  // Images: item-level extracted image + the scan/OG image.
  const images = [getVal('image'), imageUrl]
    .map((v) => safeScannedUrl(v))
    .filter((v): v is string => !!v);
  if (images.length > 0) data.images = [...new Set(images)];

  if (edits) Object.assign(data, edits);

  return {
    content_type: CONTENT_TYPE_BY_DETECTED[type],
    data,
    submission_intent: enrich ? 'enrich' : 'create',
    proposed_link_id: enrich?.id ?? null,
    proposed_link_table: enrich?.table ?? null,
  };
}
