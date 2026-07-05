import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle, ShieldCheck, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useKinkCompare, useKinkCompareSummary } from '@/hooks/useKinkCompare';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { kinkLabel, type KinkCompareRow } from '@/lib/kinks/types';
import { SIDE_LABEL } from '@/components/kinks/KinkRatingControl';

interface KinkCompareViewProps {
  otherId: string;
  otherName?: string | null;
  /** Inject a conversation opener built from a discuss-overlap. */
  onOpeningLine?: (line: string) => void;
}

function sideNote(row: KinkCompareRow): string | null {
  if (row.my_side === 'general') return null;
  return `You: ${SIDE_LABEL[row.my_side].toLowerCase()} · Them: ${SIDE_LABEL[row.their_side].toLowerCase()}`;
}

/**
 * The mutual intersection, grouped by category. Shows ONLY overlapping
 * positives — nothing one-sided, no "no"s, no limits (vetoed items are a
 * count, never named).
 */
export function KinkCompareView({ otherId, otherName, onOpeningLine }: KinkCompareViewProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: taxonomy } = useKinkTaxonomy();
  const { data: rows, isLoading } = useKinkCompare(otherId);
  const { data: summary } = useKinkCompareSummary(otherId);

  const bySlug = useMemo(() => {
    const map = new Map<string, { label: string }>();
    if (!taxonomy) return map;
    for (const c of taxonomy.categories) map.set(`c:${c.slug}`, { label: kinkLabel(c, lang) });
    for (const it of taxonomy.items) map.set(`i:${it.slug}`, { label: kinkLabel(it, lang) });
    return map;
  }, [taxonomy, lang]);

  const grouped = useMemo(() => {
    const map = new Map<string, KinkCompareRow[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.category_slug) ?? [];
      list.push(row);
      map.set(row.category_slug, list);
    }
    return map;
  }, [rows]);

  if (isLoading) {
    return <p className="py-4 text-sm text-muted-foreground">Comparing…</p>;
  }

  const discuss = (rows ?? []).filter((r) => r.kind === 'discuss');
  const name = otherName ?? 'your match';

  if (!rows?.length) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-sm text-muted-foreground">No overlapping interests visible yet.</p>
        <p className="text-13 text-muted-foreground">
          Overlaps only appear for categories you have both filled in and made visible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 rounded-badge">
            <Heart className="h-3 w-3" />
            {summary.overlaps} shared
          </Badge>
          {summary.favorites_both > 0 && (
            <Badge variant="secondary" className="gap-1 rounded-badge">
              <Star className="h-3 w-3" />
              {summary.favorites_both} both favorite
            </Badge>
          )}
          {summary.excluded_count > 0 && (
            <Badge variant="outline" className="gap-1 rounded-badge text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              {summary.excluded_count} left out, boundaries respected
            </Badge>
          )}
        </div>
      )}

      {[...grouped.entries()].map(([catSlug, catRows]) => (
        <section key={catSlug}>
          <h4 className="mb-2 text-13 font-medium uppercase tracking-wide text-muted-foreground">
            {bySlug.get(`c:${catSlug}`)?.label ?? catSlug}
          </h4>
          <ul className="space-y-1">
            {catRows.map((row) => {
              const label = bySlug.get(`i:${row.item_slug}`)?.label ?? row.item_slug;
              const note = sideNote(row);
              const bothFavorite = row.my_rating === 'favorite' && row.their_rating === 'favorite';
              return (
                <li
                  key={`${row.item_slug}:${row.my_side}`}
                  className="flex items-center justify-between gap-2 rounded-element border border-border px-4 py-2"
                >
                  <div>
                    <span className="flex items-center gap-1.5 text-sm">
                      {label}
                      {bothFavorite && <Star className="h-3.5 w-3.5" aria-label="Both favorite" />}
                      {row.kind === 'discuss' && (
                        <MessageCircle
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-label="Talk about it first"
                        />
                      )}
                    </span>
                    {note && <span className="text-xs2 text-muted-foreground">{note}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {discuss.length > 0 && (
        <section className="rounded-container border border-border p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <MessageCircle className="h-4 w-4" />
            Talk about these first
          </h4>
          <p className="mt-1 text-13 text-muted-foreground">
            You both marked these — one of you asked to discuss them before anything else.
          </p>
          {onOpeningLine && (
            <div className="mt-3 flex flex-wrap gap-2">
              {discuss.slice(0, 4).map((row) => {
                const label = bySlug.get(`i:${row.item_slug}`)?.label ?? row.item_slug;
                return (
                  <Button
                    key={`${row.item_slug}:${row.my_side}`}
                    variant="outline"
                    size="sm"
                    className="rounded-element"
                    onClick={() =>
                      onOpeningLine(
                        `We both listed "${label}" — I'd like to talk about what that means for each of us first. What does it look like for you, ${name}?`,
                      )
                    }
                  >
                    Ask about {label}
                  </Button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
