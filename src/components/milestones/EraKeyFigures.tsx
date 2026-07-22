import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useHistoryKeyFigures } from '@/hooks/useMilestones';
import type { HistoryEra } from '@/config/historyEras';

const MAX_FIGURES = 8;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/**
 * "Key figures of this era" — the people most linked to an era's published
 * milestones, ranked by how many they appear in. Derived entirely from
 * milestone_links (populated by the name-match backfill); renders nothing until
 * an era actually has linked figures, so it scales in as more links are
 * reviewed/approved rather than showing an empty shell.
 */
export function EraKeyFigures({ era }: { era: HistoryEra }) {
  const { t } = useTranslation();
  const { data: figures } = useHistoryKeyFigures();

  const top = useMemo(() => {
    if (!figures?.length) return [];
    const from = era.from ?? Number.NEGATIVE_INFINITY;
    const to = era.to ?? Number.POSITIVE_INFINITY;
    const byId = new Map<
      string,
      { slug: string; name: string; image_url: string | null; count: number }
    >();
    for (const f of figures) {
      if (f.year < from || f.year > to) continue;
      const cur = byId.get(f.personality_id);
      if (cur) cur.count += 1;
      else byId.set(f.personality_id, { slug: f.slug, name: f.name, image_url: f.image_url, count: 1 });
    }
    return [...byId.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_FIGURES);
  }, [figures, era.from, era.to]);

  if (!top.length) return null;

  return (
    <div className="mb-8">
      <p className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground">
        {t('milestones.era.keyFigures', 'Key figures of this era')}
      </p>
      <ul className="flex flex-wrap gap-2">
        {top.map((f) => (
          <li key={f.slug}>
            <LocalizedLink
              to={`/personalities/${f.slug}`}
              className="group flex items-center gap-2 rounded-badge border border-border py-1 pl-1 pr-2 transition-colors hover:bg-muted"
            >
              <Avatar className="h-7 w-7">
                {f.image_url ? <AvatarImage src={f.image_url} alt="" /> : null}
                <AvatarFallback className="text-2xs">{initials(f.name)}</AvatarFallback>
              </Avatar>
              <span className="text-13 group-hover:text-foreground">{f.name}</span>
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
