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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FieldDiffView, computeFieldDiffs } from './FieldDiffView';
import { StructuredFieldEditor } from './StructuredDataView';
import { useDedupMatchData } from '@/hooks/useTriageDetail';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

interface StagingPreviewProps {
  item: TriageItem;
  staging: Record<string, unknown>;
  onSaveFields: (changes: Record<string, unknown>) => Promise<void>;
  onDirtyChange?: (dirtyCount: number) => void;
  isSavingFields?: boolean;
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

function sourceUrl(normalized: Record<string, unknown>): URL | null {
  const meta = (normalized.metadata ?? {}) as Record<string, unknown>;
  const candidates = [normalized.url, normalized.source_url, meta.url, meta.source_url];
  const urls = normalized.urls;
  if (Array.isArray(urls)) candidates.push(urls[0]);
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed;
    } catch {
      // A malformed source URL must not crash the entire review panel.
    }
  }
  return null;
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

function TechnicalData({ normalized, enriched }: { normalized: unknown; enriched: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-2xs font-medium text-muted-foreground">
        Technical data
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 bg-muted/15 p-4">
        <div>
          <p className="mb-1 text-2xs font-medium text-muted-foreground">Normalized payload</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-element border border-border bg-background p-4 text-2xs">
            {JSON.stringify(normalized, null, 2)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-2xs font-medium text-muted-foreground">Enriched payload</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-element border border-border bg-background p-4 text-2xs">
            {JSON.stringify(enriched, null, 2)}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function StagingPreview({
  item,
  staging,
  onSaveFields,
  onDirtyChange,
  isSavingFields = false,
}: StagingPreviewProps) {
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
  // Score breakdown — mixed scales normalised in ScoreChip (≤1 → %, else 0-100).
  const confidence = (staging.ai_confidence_score as number | null) ?? item.confidence_score;
  const quality =
    (enriched.quality_score as number | undefined) ??
    (typeof enriched.quality_score_after === 'number' ? enriched.quality_score_after : undefined);
  const relevance = enriched.relevance_score as number | undefined;
  const dedupScore = staging.dedup_match_score as number | undefined;
  const reviewReason = enriched.review_reason as string | undefined;

  const { data: matchData } = useDedupMatchData(staging);
  const dedupDiffs = useMemo(
    () =>
      matchData
        ? computeFieldDiffs(matchData, normalized).filter(
            (d) => d.newValue !== undefined && d.newValue !== null,
          )
        : [],
    [matchData, normalized],
  );

  return (
    <div>
      {/* Image gallery */}
      {hero && (
        <div className="px-4 pt-4 space-y-2">
          {}
          <img
            src={hero}
            alt={item.title}
            loading="lazy"
            className="max-h-48 w-full rounded-element border object-cover"
            onError={() => setBroken((prev) => new Set(prev).add(hero))}
          />
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setHeroIdx(i)}
                  className={`shrink-0 border rounded-element overflow-hidden ${i === heroIdx ? 'border border-border-hairline' : 'border-border'}`}
                >
                  {}
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
        {link && (
          <p className="text-xs">
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {link.hostname.replace(/^www\./, '')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </div>

      <StructuredFieldEditor
        key={item.id}
        data={normalized}
        entityType={item.content_type}
        onSave={onSaveFields}
        onDirtyChange={onDirtyChange}
        saving={isSavingFields}
      />

      {/* Dedup: side-by-side with the matched live entity */}
      {matchData && (
        <div className="border-t">
          <div className="flex items-center justify-between px-4 py-1.5 bg-muted/50">
            <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              Possible duplicate
            </p>
            {typeof dedupScore === 'number' && (
              <span className="text-2xs text-muted-foreground tabular-nums">
                match {Math.round(dedupScore <= 1 ? dedupScore * 100 : dedupScore)}%
              </span>
            )}
          </div>
          <p className="px-4 py-1.5 text-xs">
            Existing:{' '}
            <span className="font-medium">
              {String(matchData.name ?? matchData.title ?? matchData.id)}
            </span>
          </p>
          {dedupDiffs.length > 0 && <FieldDiffView diffs={dedupDiffs.slice(0, 12)} />}
        </div>
      )}

      <TechnicalData normalized={staging.normalized_data} enriched={staging.enriched_data} />
    </div>
  );
}
