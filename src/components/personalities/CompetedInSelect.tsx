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
import { useCompetedInOptions, useCompetitionCategoryPeople } from '@/hooks/useCompetitions';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { COMPETED_ANY, groupCompetedInOptions } from '@/lib/competedInFilter';

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
 * no option leads to an empty grid. Every TYPE is listed, though, including
 * one with nobody linked yet: its "All" item shows 0 and is disabled, so the
 * list still says the type exists without leading to an empty grid.
 *
 * Competitions are listed alphabetically within each type (see
 * `groupCompetedInOptions`). Each competition and each "All: <type>" row shows its count of linked
 * people. The type count is DISTINCT people (from its own RPC), not a sum of
 * the rows beneath it — a queen on Drag Race and All Stars is one person.
 * "Any competition" shows the RPC's separate overall row for the same reason
 * (a sum of the types would count anyone in two types twice). Counts sit in the
 * item's `aside`, so the closed trigger shows only the label.
 *
 * If the options RPC fails, the select still offers "Any competition" and the
 * categories that are part of the static list — those need no counts to work.
 * A value from the URL that is not in the list (a deep link to a competition
 * whose only linked person was since made private) is kept selectable rather
 * than silently dropped, so the trigger never reads "Any" over a filtered grid.
 */
export function CompetedInSelect({ value, onChange }: Props) {
  useReferenceTaxonomy('competition_category');
  const { t, i18n } = useTranslation();
  const { data: options = [] } = useCompetedInOptions();
  const { data: categoryPeople } = useCompetitionCategoryPeople();
  const fmt = (n: number | undefined) => (n == null ? undefined : n.toLocaleString());

  const groups = useMemo(
    () =>
      groupCompetedInOptions(options, {
        locale: i18n.language,
        // Every type is listed, including one with nobody linked yet (drag
        // kings today): the list is also a key to what the archive covers.
        // An empty type's "All" item is disabled below rather than hidden.
        hideEmpty: false,
      }),
    [options, i18n.language],
  );

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
        {/* The RPC's overall row is keyed `any`, the same token as COMPETED_ANY:
            a DISTINCT count across every type, not a sum of the type rows. */}
        <SelectItem value={COMPETED_ANY} aside={fmt(categoryPeople?.get(COMPETED_ANY))}>
          {t('pages.personalities.competedIn.any', 'Any competition')}
        </SelectItem>
        {value && !known.has(value) && <SelectItem value={value}>{value}</SelectItem>}
        {groups.map((g) => (
          <SelectGroup key={g.category.id}>
            <SelectSeparator />
            <SelectLabel>{t(g.category.labelKey, g.category.label)}</SelectLabel>
            <SelectItem
              value={g.category.id}
              // Disabled only on a MEASURED zero (counts loaded, no row for
              // this type), so an outage never greys out the whole list.
              disabled={categoryPeople != null && !categoryPeople.get(g.category.id)}
              aside={
                categoryPeople != null ? fmt(categoryPeople.get(g.category.id) ?? 0) : undefined
              }
            >
              {t('pages.personalities.competedIn.allOfType', {
                defaultValue: 'All: {{type}}',
                type: t(g.category.labelKey, g.category.label),
              })}
            </SelectItem>
            {g.items.map((i) => (
              <SelectItem key={i.slug} value={i.slug} aside={fmt(i.people)}>
                {i.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
