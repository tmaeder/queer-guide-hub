import { useTranslation } from 'react-i18next';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import { useAccessibilityAttributes } from '@/hooks/useAccessibilityAttributes';
import { useKinkFilterTerms } from '@/hooks/useKinkFilterTerms';
import { EVENT_TYPE_GROUPS } from '@/lib/goingOutFilters';

export interface InterestSelection {
  /** One `EVENT_TYPE_GROUPS` id, or null. Events only. */
  type: string | null;
  groups: string[];
  tags: string[];
  access: string[];
}

export const NO_INTERESTS: InterestSelection = { type: null, groups: [], tags: [], access: [] };

export function hasInterests(s: InterestSelection) {
  return Boolean(s.type) || s.groups.length + s.tags.length + s.access.length > 0;
}

export const toggleIn = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

// Negative assertions ("not step-free") are facts about a place, not something
// anyone filters for.
const isNegative = (slug: string) => /^(not|no)-/.test(slug);

export interface ActiveInterest {
  key: string;
  label: string;
  /** The selection with just this one removed. */
  without: (s: InterestSelection) => InterestSelection;
}

/**
 * The option lists for the /going-out filters, and the human labels of what
 * is currently selected — shared by the menu, the pills and the section
 * summaries so all three name a filter the same way.
 */
export function useInterestOptions(value: InterestSelection) {
  const { t } = useTranslation();
  const { targetGroups } = useTargetGroups();
  const { accessibilityAttributes } = useAccessibilityAttributes();
  const { data: kinkTerms } = useKinkFilterTerms();

  const groups = targetGroups
    .map((g) => ({ slug: String(g.slug ?? ''), name: String(g.name ?? g.slug ?? '') }))
    .filter((g) => g.slug);
  const access = accessibilityAttributes
    .map((a) => ({
      slug: String(a.slug ?? ''),
      name: t(`amenities.${String(a.slug ?? '')}`, String(a.name ?? a.slug ?? '')),
    }))
    .filter((a) => a.slug && !isNegative(a.slug));
  const activity = EVENT_TYPE_GROUPS.find((g) => g.id === value.type);

  const active: ActiveInterest[] = [
    ...(activity
      ? [
          {
            key: `type:${activity.id}`,
            label: t(`goingOut.events.types.${activity.id}`, activity.label),
            without: (s: InterestSelection) => ({ ...s, type: null }),
          },
        ]
      : []),
    ...value.groups.map((slug) => ({
      key: `group:${slug}`,
      label: groups.find((g) => g.slug === slug)?.name ?? slug,
      without: (s: InterestSelection) => ({ ...s, groups: toggleIn(s.groups, slug) }),
    })),
    ...value.tags.map((slug) => ({
      key: `tag:${slug}`,
      label: kinkTerms?.find((k) => k.slug === slug)?.label ?? slug,
      without: (s: InterestSelection) => ({ ...s, tags: toggleIn(s.tags, slug) }),
    })),
    ...value.access.map((slug) => ({
      key: `access:${slug}`,
      label: access.find((a) => a.slug === slug)?.name ?? slug,
      without: (s: InterestSelection) => ({ ...s, access: toggleIn(s.access, slug) }),
    })),
  ];

  return { groups, access, active };
}

/** "Darkroom, Trans people +1" — for section summaries. */
export function summarizeInterests(active: ActiveInterest[], max = 2): string | null {
  if (active.length === 0) return null;
  const head = active.slice(0, max).map((a) => a.label);
  const more = active.length - head.length;
  return more > 0 ? `${head.join(', ')} +${more}` : head.join(', ');
}
