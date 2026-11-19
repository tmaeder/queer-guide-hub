import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { UserRound } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useHistoryKeyFigures } from '@/hooks/useMilestones';
import type { HistoryEra } from '@/config/historyEras';

const MAX_FIGURES = 8;

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
      else
        byId.set(f.personality_id, {
          slug: f.slug,
          name: f.name,
          image_url: f.image_url,
          count: 1,
        });
    }
    return [...byId.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_FIGURES);
  }, [figures, era.from, era.to]);

  if (!top.length) return null;

  return (
    <div className="mb-8">
      <p className="mb-4 text-13 font-bold uppercase tracking-label text-foreground">
        {t('milestones.era.keyFigures', 'Key figures of this era')}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {top.map((f) => (
          <li key={f.slug}>
            <LocalizedLink
              to={`/personalities/${f.slug}`}
              // A chip FILLS on hover — it never lifts. `no-underline` keeps the
              // unlayered `li a` rule from collapsing the flex row.
              className="flex items-center gap-2 bg-card py-1 pl-1 pr-4 text-15 font-bold no-underline transition-colors duration-fast hover:bg-foreground hover:text-background rounded-container shadow-soft"
            >
              {/* Avatars are circles — the sanctioned rounded-full exception. */}
              <Avatar className="h-9 w-9">
                {f.image_url ? <AvatarImage src={f.image_url} alt="" /> : null}
                <AvatarFallback>
                  <UserRound size={18} aria-hidden />
                </AvatarFallback>
              </Avatar>
              {f.name}
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
