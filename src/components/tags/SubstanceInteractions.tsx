import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useSubstanceInteractions } from '@/hooks/useTagRelationships';
import { interactionVisual, INTERACTION_ORDER, type InteractionStatus } from '@/lib/substanceRisk';

/**
 * What this substance must not be combined with.
 *
 * ORDER IS THE SAFETY FEATURE. Grouped worst-first, and the RPC sorts by the
 * same rank the palette declares. Someone opening /tags/ghb is not browsing —
 * they want to know whether the thing in their other hand will hurt them, and
 * that answer must be the first thing on screen, never below a fold or behind
 * a disclosure.
 *
 * ABSENCE IS STATED, NOT IMPLIED. If a pair is not in the data, the chart says
 * nothing about it — which is emphatically not the same as "safe". The footer
 * says so out loud, because a grid with a gap in it reads as a cleared square.
 *
 * Every level renders tint + ink border + icon + label. The border is required
 * (these tints are ~1.1:1 against paper and clear 1.4.11 only against ink) and
 * the icon+label are what carry the meaning for a colour-blind reader.
 */

interface Props {
  tagId: string;
  tagName: string;
}

export function SubstanceInteractions({ tagId, tagName }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useSubstanceInteractions(tagId);
  const rows = useMemo(() => data ?? [], [data]);

  const grouped = useMemo(() => {
    const by = new Map<InteractionStatus, typeof rows>();
    for (const r of rows) {
      const key = (INTERACTION_ORDER as string[]).includes(r.status)
        ? (r.status as InteractionStatus)
        : ('unknown' as InteractionStatus);
      const list = by.get(key) ?? [];
      list.push(r);
      by.set(key, list);
    }
    return INTERACTION_ORDER.map((s) => [s, by.get(s) ?? []] as const).filter(
      ([, list]) => list.length > 0,
    );
  }, [rows]);

  // Render nothing rather than an empty shell: most glossary terms are not
  // substances and have no row in this table at all.
  if (isLoading || rows.length === 0) return null;

  const attribution = rows[0];

  return (
    <section className="border border-border-hairline">
      <header className="border-b border-border-hairline bg-foreground px-4 py-4 text-background">
        <Eyebrow className="text-background/70">
          {t('tags.interactions.eyebrow', 'Combinations')}
        </Eyebrow>
        <h2 className="mt-1 text-title font-bold">
          {t('tags.interactions.title', 'Mixing {{name}}', { name: tagName })}
        </h2>
      </header>

      <div className="divide-y-2 divide-foreground/15">
        {grouped.map(([status, list]) => {
          const v = interactionVisual(status);
          const Icon = v.Icon;
          return (
            <div key={status} className="p-4">
              <div
                className="mb-4 inline-flex items-center gap-2 bg-muted rounded-element px-2 py-1.5"
                style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-2xs font-bold uppercase tracking-label">{v.label}</span>
                <span className="text-2xs font-bold tabular-nums opacity-70">{list.length}</span>
              </div>
              <p className="mb-4 text-13 leading-relaxed text-muted-foreground">{v.meaning}</p>

              <ul className="flex list-none flex-col gap-2 p-0">
                {list.map((r) => (
                  <li key={r.other_id} className="bg-muted p-2">
                    <LocalizedLink
                      to={`/tags/${encodeURIComponent(r.other_slug)}`}
                      className="text-13 font-bold text-foreground no-underline hover:underline"
                    >
                      {r.other_name}
                    </LocalizedLink>
                    {r.note && (
                      <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{r.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <footer className="border-t border-border-hairline p-4">
        <p className="text-13 leading-relaxed text-muted-foreground">
          {t(
            'tags.interactions.absence',
            'A combination that is not listed is one this chart says nothing about — that is not the same as safe.',
          )}
        </p>
        {/* The only route into the full grid. Without this the page exists but
            is reachable solely by typing the URL. */}
        <LocalizedLink
          to="/tags/interactions"
          className="mt-4 inline-block px-4 py-2 text-13 font-bold text-foreground no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('tags.interactions.seeAll', 'See the full interaction chart')}
        </LocalizedLink>
        <p className="mt-2 text-2xs uppercase tracking-label text-muted-foreground">
          {t('tags.interactions.credit', 'Interaction data by')}{' '}
          <a href={attribution.source_url} target="_blank" rel="noopener noreferrer">
            TripSit
          </a>
        </p>
      </footer>
    </section>
  );
}
