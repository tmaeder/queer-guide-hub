import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { KinkFilterGroup } from '@/components/kink/KinkFilterGroup';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

// Negative assertions ("not step-free") are facts about a place, not something
// anyone filters for.
const isNegative = (slug: string) => /^(not|no)-/.test(slug);

/**
 * Keep the popover open while a dialog launched from inside it has focus —
 * the 18+ confirmation is a portalled dialog, and closing the popover would
 * unmount the component that owns it.
 */
const insideDialog = (e: Event) => {
  const target = e.target as Element | null;
  if (target?.closest?.('[role="dialog"],[role="alertdialog"]')) e.preventDefault();
};

/** One "Label ▾" trigger and its chip panel. */
function Dropdown({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip
          active={count > 0}
          aria-label={count > 0 ? `${label} (${count})` : label}
          label={
            <>
              <span className="whitespace-nowrap">{label}</span>
              {count > 0 && <span className="tabular-nums">{count}</span>}
              <span aria-hidden>▾</span>
            </>
          }
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // Clear the sticky header and the mobile bottom nav, and never grow
        // past the room that is left: the panel scrolls instead.
        collisionPadding={{ top: 96, bottom: 104, left: 16, right: 16 }}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
        onFocusOutside={insideDialog}
        onInteractOutside={insideDialog}
      >
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Activities, audiences, features, kinks and accessibility as one compact row
 * of dropdowns, with the active choices listed underneath as removable pills.
 * Every choice narrows both "What's on" and "Where to go", except Activities,
 * which are event types and have no meaning for a place.
 */
export function GoingOutInterests({
  value,
  onChange,
}: {
  value: InterestSelection;
  onChange: (next: InterestSelection) => void;
}) {
  const { t } = useTranslation();
  const { targetGroups } = useTargetGroups();
  const { accessibilityAttributes } = useAccessibilityAttributes();
  const { data: kinkTerms } = useKinkFilterTerms();

  const groups = targetGroups
    .map((g) => ({ slug: String(g.slug ?? ''), name: String(g.name ?? g.slug ?? '') }))
    .filter((g) => g.slug);
  const access = accessibilityAttributes
    .map((a) => ({ slug: String(a.slug ?? ''), name: String(a.name ?? a.slug ?? '') }))
    .filter((a) => a.slug && !isNegative(a.slug));
  const activity = EVENT_TYPE_GROUPS.find((g) => g.id === value.type);
  const accessLabel = (slug: string, name: string) => t(`amenities.${slug}`, name);

  const pills: { key: string; label: string; remove: () => void }[] = [
    ...(activity
      ? [
          {
            key: `type:${activity.id}`,
            label: t(`goingOut.events.types.${activity.id}`, activity.label),
            remove: () => onChange({ ...value, type: null }),
          },
        ]
      : []),
    ...value.groups.map((slug) => ({
      key: `group:${slug}`,
      label: groups.find((g) => g.slug === slug)?.name ?? slug,
      remove: () => onChange({ ...value, groups: toggle(value.groups, slug) }),
    })),
    ...value.tags.map((slug) => ({
      key: `tag:${slug}`,
      label: kinkTerms?.find((k) => k.slug === slug)?.label ?? slug,
      remove: () => onChange({ ...value, tags: toggle(value.tags, slug) }),
    })),
    ...value.access.map((slug) => ({
      key: `access:${slug}`,
      label: accessLabel(slug, access.find((a) => a.slug === slug)?.name ?? slug),
      remove: () => onChange({ ...value, access: toggle(value.access, slug) }),
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t('goingOut.interests.label', 'Interests')}
        className="flex flex-wrap gap-2"
      >
        <Dropdown
          label={t('goingOut.interests.activities', 'Activities')}
          count={value.type ? 1 : 0}
        >
          {EVENT_TYPE_GROUPS.map((g) => (
            <FilterChip
              key={g.id}
              active={value.type === g.id}
              onClick={() => onChange({ ...value, type: value.type === g.id ? null : g.id })}
              label={
                <>
                  <TransitIcon name={g.icon} size={16} />
                  {t(`goingOut.events.types.${g.id}`, g.label)}
                </>
              }
            />
          ))}
        </Dropdown>

        {groups.length > 0 && (
          <Dropdown
            label={t('goingOut.interests.groups', 'Who it’s for')}
            count={value.groups.length}
          >
            {groups.map((g) => (
              <FilterChip
                key={g.slug}
                active={value.groups.includes(g.slug)}
                onClick={() => onChange({ ...value, groups: toggle(value.groups, g.slug) })}
                label={g.name}
              />
            ))}
          </Dropdown>
        )}

        <Dropdown
          label={t('goingOut.interests.kinks', 'Kinks & features')}
          count={value.tags.length}
        >
          {/* Its own 18+ unlock for the sensitive terms. */}
          <KinkFilterGroup
            target="events"
            selected={value.tags}
            onToggle={(slug) => onChange({ ...value, tags: toggle(value.tags, slug) })}
          />
        </Dropdown>

        {access.length > 0 && (
          <Dropdown
            label={t('goingOut.interests.access', 'Accessibility')}
            count={value.access.length}
          >
            {access.map((a) => (
              <FilterChip
                key={a.slug}
                active={value.access.includes(a.slug)}
                onClick={() => onChange({ ...value, access: toggle(value.access, a.slug) })}
                label={accessLabel(a.slug, a.name)}
              />
            ))}
          </Dropdown>
        )}
      </div>

      {pills.length > 0 && (
        <ul
          aria-label={t('goingOut.interests.active', 'Active filters')}
          className="m-0 flex list-none flex-wrap items-center gap-2 p-0"
        >
          {pills.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={p.remove}
                aria-label={t('goingOut.interests.remove', 'Remove {{filter}}', {
                  filter: p.label,
                })}
                className="inline-flex min-h-11 items-center gap-1 rounded-badge bg-foreground px-2 text-13 font-bold text-background"
              >
                {p.label}
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onChange(NO_INTERESTS)}
              className="min-h-11 px-2 text-13 font-bold underline underline-offset-4"
            >
              {t('goingOut.interests.clear', 'Clear')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
