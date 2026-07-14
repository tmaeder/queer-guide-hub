/**
 * StagingPreview — rich visual preview for ingestion_staging rows in the
 * unified review queue. Staging items usually have no committed entity yet
 * (entity_id is null), so the generic entity-card preview never fires — this
 * renders directly from normalized_data / enriched_data: image gallery, score
 * breakdown, gate reason, source link, dedup comparison and raw payloads.
 */

import { useMemo, useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FieldDiffView, computeFieldDiffs } from './FieldDiffView';
import { useDedupMatchData } from '@/hooks/useTriageDetail';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

interface StagingPreviewProps {
  item: TriageItem;
  staging: Record<string, unknown>;
}

/** Pulls every plausible image URL out of a staging payload, deduped. */
function collectImages(
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.push(v);
    else if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
      push((v as { url: string }).url);
    }
  };
  // Replacement image from quality-enhance wins the hero slot.
  push(enriched.image_url);
  const imgs = normalized.images;
  if (Array.isArray(imgs)) imgs.forEach(push);
  push(normalized.image_url);
  const meta = (normalized.metadata ?? {}) as Record<string, unknown>;
  push(meta.image_url);
  return Array.from(new Set(urls)).slice(0, 6);
}

function sourceUrl(normalized: Record<string, unknown>): string | null {
  const meta = (normalized.metadata ?? {}) as Record<string, unknown>;
  const candidates = [normalized.url, normalized.source_url, meta.url, meta.source_url];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
  }
  const urls = normalized.urls;
  if (Array.isArray(urls) && typeof urls[0] === 'string' && /^https?:\/\//.test(urls[0])) {
    return urls[0];
  }
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function humanizeReason(raw: string): string {
  const map: Record<string, string> = {
    low_confidence: 'Combined confidence below the auto-approve threshold',
    low_source_reliability: 'Source reliability is low — forced to review',
    force_review: 'Pipeline is configured to force human review',
    llm_needs_review: 'LLM quality check asked for a human decision',
    auto_publish_blocked: 'LLM passed it, but the publish gate is blocked',
    awaiting_llm_verdict: 'Waiting for the LLM quality verdict',
  };
  return map[raw] ?? raw.replace(/_/g, ' ');
}

function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  if (typeof value !== 'number') return null;
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return (
    <Badge variant="outline" className="text-2xs normal-case tabular-nums gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={pct < 70 ? 'text-muted-foreground' : 'font-semibold'}>{pct}%</span>
    </Badge>
  );
}

function JsonSection({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  if (!data || (typeof data === 'object' && Object.keys(data as object).length === 0)) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 border-t">
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="px-4 py-2 text-2xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all bg-muted/30">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function StagingPreview({ item, staging }: StagingPreviewProps) {
  const normalized = useMemo(
    () => (staging.normalized_data ?? {}) as Record<string, unknown>,
    [staging.normalized_data],
  );
  const enriched = useMemo(
    () => (staging.enriched_data ?? {}) as Record<string, unknown>,
    [staging.enriched_data],
  );

  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [heroIdx, setHeroIdx] = useState(0);

  const images = useMemo(
    () => collectImages(normalized, enriched).filter((u) => !broken.has(u)),
    [normalized, enriched, broken],
  );
  const hero = images[Math.min(heroIdx, images.length - 1)];

  const link = sourceUrl(normalized);
  const description = useMemo(() => {
    const raw = String(normalized.description ?? normalized.content ?? '');
    const text = stripHtml(raw);
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  }, [normalized]);

  // Score breakdown — mixed scales normalised in ScoreChip (≤1 → %, else 0-100).
  const confidence = (staging.ai_confidence_score as number | null) ?? item.confidence_score;
  const quality = (enriched.quality_score as number | undefined)
    ?? (typeof enriched.quality_score_after === 'number' ? enriched.quality_score_after : undefined);
  const relevance = enriched.relevance_score as number | undefined;
  const dedupScore = staging.dedup_match_score as number | undefined;
  const reviewReason = enriched.review_reason as string | undefined;

  const { data: matchData } = useDedupMatchData(staging);
  const dedupDiffs = useMemo(
    () => (matchData ? computeFieldDiffs(matchData, normalized).filter((d) => d.newValue !== undefined && d.newValue !== null) : []),
    [matchData, normalized],
  );

  return (
    <div>
      {/* Image gallery */}
      {hero && (
        <div className="px-4 pt-4 space-y-2">
          <img
            src={hero}
            alt={item.title}
            loading="lazy"
            className="w-full max-h-64 object-cover rounded-element border"
            onError={() => setBroken((prev) => new Set(prev).add(hero))}
          />
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setHeroIdx(i)}
                  className={`shrink-0 border rounded-element overflow-hidden ${i === heroIdx ? 'border-foreground' : 'border-border'}`}
                >
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="h-12 w-16 object-cover"
                    onError={() => setBroken((prev) => new Set(prev).add(url))}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scores + reason */}
      <div className="px-4 py-4 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ScoreChip label="Confidence" value={confidence} />
          <ScoreChip label="Quality" value={quality} />
          <ScoreChip label="Relevance" value={relevance} />
          <ScoreChip label="Dedup match" value={dedupScore} />
        </div>
        {reviewReason && (
          <p className="text-xs text-muted-foreground">
            <span className="text-2xs uppercase tracking-wider">Reason</span>{' '}
            {humanizeReason(reviewReason)}
          </p>
        )}
        {description && <p className="text-xs leading-relaxed">{description}</p>}
        {link && (
          <p className="text-xs">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {new URL(link).hostname.replace(/^www\./, '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </div>

      {/* Dedup: side-by-side with the matched live entity */}
      {matchData && (
        <div className="border-t">
          <div className="flex items-center justify-between px-4 py-1.5 bg-muted/50">
            <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              Possible duplicate
            </p>
            {typeof dedupScore === 'number' && (
              <span className="text-2xs text-muted-foreground tabular-nums">
                match {Math.round((dedupScore <= 1 ? dedupScore * 100 : dedupScore))}%
              </span>
            )}
          </div>
          <p className="px-4 py-1.5 text-xs">
            Existing: <span className="font-medium">{String(matchData.name ?? matchData.title ?? matchData.id)}</span>
          </p>
          {dedupDiffs.length > 0 && <FieldDiffView diffs={dedupDiffs.slice(0, 12)} />}
        </div>
      )}

      {/* Raw payloads */}
      <JsonSection label="Normalized data" data={staging.normalized_data} />
      <JsonSection label="Enriched data" data={staging.enriched_data} />
    </div>
  );
}
