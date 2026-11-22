import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AgeAffirmationModal } from '@/components/age-gate/AgeAffirmationModal';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useKinkFilterTerms, termsFor, type KinkTarget } from '@/hooks/useKinkFilterTerms';
import { cn } from '@/lib/utils';

interface KinkFilterGroupProps {
  target: KinkTarget;
  /** Currently selected tag slugs (the page's `tags` filter). */
  selected: string[];
  /** Toggle one slug in or out of the page's `tags` filter. */
  onToggle: (slug: string) => void;
}

/**
 * "Kink & features" chips for /events and /venues. Every chip is a glossary
 * tag; selecting it writes the same `tags` filter the rest of the page uses.
 *
 * Without the 18+ confirmation only the terms marked public (sauna, steam
 * room, darkroom, …) render, plus one button that opens the shared age dialog.
 * A selected chip always renders, so an active filter can be removed.
 */
export function KinkFilterGroup({ target, selected, onToggle }: KinkFilterGroupProps) {
  const { t } = useTranslation();
  const { data } = useKinkFilterTerms();
  const { affirmed } = useAgeAffirmation();
  const [asking, setAsking] = useState(false);

  const terms = termsFor(data, target);
  if (terms.length === 0) return null;

  const visible = terms.filter(
    (term) => affirmed || term.public_without_18 || selected.includes(term.slug),
  );
  const hasLocked = !affirmed && terms.some((term) => !term.public_without_18);

  const row = (group: 'feature' | 'kink', title: string) => {
    const items = visible.filter((term) => term.term_group === group);
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">{title}</span>
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {items.map((term) => (
            <FilterChip
              key={term.slug}
              active={selected.includes(term.slug)}
              onClick={() => onToggle(term.slug)}
              className={cn(
                term.count === 0 && !selected.includes(term.slug) && 'text-muted-foreground',
              )}
              title={term.short_description ?? undefined}
              label={
                <>
                  <span className="whitespace-nowrap">{term.label}</span>
                  <span className="tabular-nums text-xs2 opacity-70">{term.count}</span>
                </>
              }
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section
      data-testid="kink-filter-group"
      aria-label={t('kinkFilters.title', 'Kink & features')}
      className="flex flex-col gap-4"
    >
      {row('feature', t('kinkFilters.features', 'Features'))}
      {row('kink', t('kinkFilters.kinks', 'Kinks'))}
      <div className="flex flex-wrap items-center gap-4">
        {hasLocked && (
          <FilterChip
            active={false}
            aria-pressed={undefined}
            data-testid="kink-filter-unlock"
            onClick={() => setAsking(true)}
            label={t('kinkFilters.unlock', 'Show kink & fetish filters (18+)')}
          />
        )}
        {affirmed && (
          <LocalizedLink to="/kinks" className="text-13">
            {t('kinkFilters.browseAll', 'Browse all kinks & features')}
          </LocalizedLink>
        )}
      </div>
      <AgeAffirmationModal active={asking} onDecline={() => setAsking(false)} />
    </section>
  );
}
