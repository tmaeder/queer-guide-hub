import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useKinkVisibleList } from '@/hooks/useKinkVisibleList';
import { useKinkTaxonomy } from '@/hooks/useKinkTaxonomy';
import { kinkLabel, type KinkVisibleRow } from '@/lib/kinks/types';
import { SIDE_LABEL } from '@/components/kinks/kinkRatingMeta';

/**
 * Read-only view of what another user shows me (their tier ladder applies
 * server-side; positives only).
 */
export function KinkVisibleList({ ownerId }: { ownerId: string }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  const { data: rows, isLoading } = useKinkVisibleList(ownerId);
  const { data: taxonomy } = useKinkTaxonomy();

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    if (!taxonomy) return map;
    for (const c of taxonomy.categories) map.set(`c:${c.slug}`, kinkLabel(c, lang));
    for (const it of taxonomy.items) map.set(`i:${it.slug}`, kinkLabel(it, lang));
    return map;
  }, [taxonomy, lang]);

  const grouped = useMemo(() => {
    const map = new Map<string, KinkVisibleRow[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.category_slug) ?? [];
      list.push(row);
      map.set(row.category_slug, list);
    }
    return map;
  }, [rows]);

  if (isLoading) return <p className="py-2 text-13 text-muted-foreground">Loading…</p>;
  if (!rows?.length) return null;

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([catSlug, catRows]) => (
        <section key={catSlug}>
          <h4 className="mb-1.5 text-13 font-medium uppercase tracking-wide text-muted-foreground">
            {labels.get(`c:${catSlug}`) ?? catSlug}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {catRows.map((row) => (
              <Badge
                key={`${row.item_slug}:${row.side}`}
                variant={row.rating === 'favorite' ? 'default' : 'secondary'}
                className="gap-1 rounded-badge"
              >
                {row.rating === 'favorite' && <Star className="h-3 w-3" />}
                {labels.get(`i:${row.item_slug}`) ?? row.item_slug}
                {row.side !== 'general' && (
                  <span className="opacity-70">· {SIDE_LABEL[row.side].toLowerCase()}</span>
                )}
                {row.needs_discussion && <MessageCircle className="h-3 w-3" />}
              </Badge>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
