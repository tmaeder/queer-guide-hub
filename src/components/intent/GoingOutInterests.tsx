import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { KinkFilterGroup } from '@/components/kink/KinkFilterGroup';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import { useAccessibilityAttributes } from '@/hooks/useAccessibilityAttributes';
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

const COLLAPSED = 8;

/** A labelled chip row. Long rows show the first few, plus anything selected. */
function Group({
  title,
  items,
}: {
  title: string;
  items: { key: string; active: boolean; chip: ReactNode }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = items.length > COLLAPSED + 2;
  const shown = !long || open ? items : items.filter((it, i) => i < COLLAPSED || it.active);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{title}</span>
      <div role="group" aria-label={title} className="flex flex-wrap gap-2">
        {shown.map((it) => (
          <span key={it.key} className="contents">
            {it.chip}
          </span>
        ))}
        {long && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="min-h-11 px-2 text-13 font-bold underline underline-offset-4"
          >
            {open
              ? t('goingOut.interests.fewer', 'Show fewer')
              : t('goingOut.interests.more', 'Show all ({{count}})', { count: items.length })}
          </button>
        )}
      </div>
    </div>
  );
}

// Negative assertions ("not step-free") are facts about a place, not something
// anyone filters for.
const isNegative = (slug: string) => /^(not|no)-/.test(slug);

/**
 * Activities, audiences, features, kinks and accessibility in one place. Every
 * choice narrows both "What's on" and "Where to go", except Activities, which
 * are event types and have no meaning for a place.
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
  const groups = targetGroups
    .map((g) => ({ slug: String(g.slug ?? ''), name: String(g.name ?? g.slug ?? '') }))
    .filter((g) => g.slug);
  const access = accessibilityAttributes
    .map((a) => ({ slug: String(a.slug ?? ''), name: String(a.name ?? a.slug ?? '') }))
    .filter((a) => a.slug && !isNegative(a.slug));

  return (
    <div className="flex flex-col gap-6">
      <Group
        title={t('goingOut.interests.activities', 'Activities')}
        items={EVENT_TYPE_GROUPS.map((g) => ({
          key: g.id,
          active: value.type === g.id,
          chip: (
            <FilterChip
              active={value.type === g.id}
              onClick={() => onChange({ ...value, type: value.type === g.id ? null : g.id })}
              label={
                <>
                  <TransitIcon name={g.icon} size={16} />
                  {t(`goingOut.events.types.${g.id}`, g.label)}
                </>
              }
            />
          ),
        }))}
      />

      {groups.length > 0 && (
        <Group
          title={t('goingOut.interests.groups', 'Who it’s for')}
          items={groups.map((g) => ({
            key: g.slug,
            active: value.groups.includes(g.slug),
            chip: (
              <FilterChip
                active={value.groups.includes(g.slug)}
                onClick={() => onChange({ ...value, groups: toggle(value.groups, g.slug) })}
                label={g.name}
              />
            ),
          }))}
        />
      )}

      {/* Features and kinks, with its own 18+ unlock for the sensitive terms. */}
      <KinkFilterGroup
        target="events"
        selected={value.tags}
        onToggle={(slug) => onChange({ ...value, tags: toggle(value.tags, slug) })}
      />

      {access.length > 0 && (
        <Group
          title={t('goingOut.interests.access', 'Accessibility')}
          items={access.map((a) => ({
            key: a.slug,
            active: value.access.includes(a.slug),
            chip: (
              <FilterChip
                active={value.access.includes(a.slug)}
                onClick={() => onChange({ ...value, access: toggle(value.access, a.slug) })}
                label={t(`amenities.${a.slug}`, a.name)}
              />
            ),
          }))}
        />
      )}

      {hasInterests(value) && (
        <div>
          <button
            type="button"
            onClick={() => onChange(NO_INTERESTS)}
            className="min-h-11 text-13 font-bold underline underline-offset-4"
          >
            {t('goingOut.interests.clear', 'Clear filters')}
          </button>
        </div>
      )}
    </div>
  );
}
