import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompetedInOptions, type CompetedInOption } from '@/hooks/useCompetitions';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { COMPETITION_CATEGORIES } from '@/lib/competitionCategories';
import { COMPETED_ANY } from '@/lib/competedInFilter';

/** Radix Select forbids an empty-string item value, so "no filter" needs a sentinel. */
const NONE = '__none__';

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * "Competed in" for the personalities directory.
 *
 * Grouped by competition type, and each group opens with an "All <type>" item
 * that filters to the whole category. Competitions are offered only when at
 * least one public personality is linked to them (`useCompetedInOptions`), so
 * no option leads to an empty grid. A category with no linked people is not
 * offered either.
 *
 * If the options RPC fails, the select still offers "Any competition" and the
 * categories that are part of the static list — those need no counts to work.
 * A value from the URL that is not in the list (a deep link to a competition
 * whose only linked person was since made private) is kept selectable rather
 * than silently dropped, so the trigger never reads "Any" over a filtered grid.
 */
export function CompetedInSelect({ value, onChange }: Props) {
  useReferenceTaxonomy('competition_category');
  const { t } = useTranslation();
  const { data: options = [], isSuccess } = useCompetedInOptions();

  const groups = useMemo(() => {
    const byCategory = new Map<string, CompetedInOption[]>();
    for (const o of options) {
      const list = byCategory.get(o.category) ?? [];
      list.push(o);
      byCategory.set(o.category, list);
    }
    return (
      COMPETITION_CATEGORIES.map((c) => ({ category: c, items: byCategory.get(c.id) ?? [] }))
        // Without counts we cannot tell an empty category from a populated one,
        // so every category is offered; with them, empty ones are hidden.
        .filter((g) => !isSuccess || options.length === 0 || g.items.length > 0)
    );
  }, [options, isSuccess]);

  const known = useMemo(() => {
    const s = new Set<string>([COMPETED_ANY]);
    for (const g of groups) {
      s.add(g.category.id);
      for (const i of g.items) s.add(i.slug);
    }
    return s;
  }, [groups]);

  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger
        className="w-56"
        aria-label={t('pages.personalities.competedIn.label', 'Competed in')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('pages.personalities.competedIn.none', 'Everyone')}</SelectItem>
        <SelectItem value={COMPETED_ANY}>
          {t('pages.personalities.competedIn.any', 'Any competition')}
        </SelectItem>
        {value && !known.has(value) && <SelectItem value={value}>{value}</SelectItem>}
        {groups.map((g) => (
          <SelectGroup key={g.category.id}>
            <SelectSeparator />
            <SelectLabel>{t(g.category.labelKey, g.category.label)}</SelectLabel>
            <SelectItem value={g.category.id}>
              {t('pages.personalities.competedIn.allOfType', {
                defaultValue: 'All: {{type}}',
                type: t(g.category.labelKey, g.category.label),
              })}
            </SelectItem>
            {g.items.map((i) => (
              <SelectItem key={i.slug} value={i.slug}>
                {i.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
