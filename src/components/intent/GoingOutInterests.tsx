import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { KinkFilterGroup } from '@/components/kink/KinkFilterGroup';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  NO_INTERESTS,
  toggleIn,
  useInterestOptions,
  type InterestSelection,
} from '@/hooks/useInterestOptions';
import { EVENT_TYPE_GROUPS } from '@/lib/goingOutFilters';

/**
 * Keep the popover open while a dialog launched from inside it has focus —
 * the 18+ confirmation is a portalled dialog, and closing the popover would
 * unmount the component that owns it.
 */
const insideDialog = (e: Event) => {
  const target = e.target as Element | null;
  if (target?.closest?.('[role="dialog"],[role="alertdialog"]')) e.preventDefault();
};

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
        {title}
        {note ? <span className="normal-case tracking-normal"> · {note}</span> : null}
      </span>
      <div role="group" aria-label={title} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

/**
 * One "Filters ▾" control for activities, audiences, features, kinks and
 * accessibility. Every choice narrows Highlights, What's on and Where to go,
 * except Activities, which are event types and only narrow What's on.
 */
export function InterestsMenu({
  value,
  onChange,
}: {
  value: InterestSelection;
  onChange: (next: InterestSelection) => void;
}) {
  const { t } = useTranslation();
  const { groups, access, active } = useInterestOptions(value);
  const label = t('goingOut.interests.label', 'Filters');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip
          active={active.length > 0}
          aria-label={active.length > 0 ? `${label} (${active.length})` : label}
          label={
            <>
              <span className="whitespace-nowrap">{label}</span>
              {active.length > 0 && <span className="tabular-nums">{active.length}</span>}
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
        className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(30rem,calc(100vw-2rem))] flex-col gap-6 overflow-y-auto"
        onFocusOutside={insideDialog}
        onInteractOutside={insideDialog}
      >
        <Group
          title={t('goingOut.interests.activities', 'Activities')}
          note={t('goingOut.interests.eventsOnly', 'events only')}
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
        </Group>

        {groups.length > 0 && (
          <Group title={t('goingOut.interests.groups', 'Who it’s for')}>
            {groups.map((g) => (
              <FilterChip
                key={g.slug}
                active={value.groups.includes(g.slug)}
                onClick={() => onChange({ ...value, groups: toggleIn(value.groups, g.slug) })}
                label={g.name}
              />
            ))}
          </Group>
        )}

        {/* Features and kinks, with its own 18+ unlock for the sensitive terms. */}
        <KinkFilterGroup
          target="events"
          selected={value.tags}
          onToggle={(slug) => onChange({ ...value, tags: toggleIn(value.tags, slug) })}
        />

        {access.length > 0 && (
          <Group title={t('goingOut.interests.access', 'Accessibility')}>
            {access.map((a) => (
              <FilterChip
                key={a.slug}
                active={value.access.includes(a.slug)}
                onClick={() => onChange({ ...value, access: toggleIn(value.access, a.slug) })}
                label={a.name}
              />
            ))}
          </Group>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The active filters as removable pills, plus "Clear". */
export function InterestPills({
  value,
  onChange,
}: {
  value: InterestSelection;
  onChange: (next: InterestSelection) => void;
}) {
  const { t } = useTranslation();
  const { active } = useInterestOptions(value);
  if (active.length === 0) return null;
  return (
    <ul
      aria-label={t('goingOut.interests.active', 'Active filters')}
      className="m-0 flex list-none items-center gap-2 p-0"
    >
      {active.map((a) => (
        <li key={a.key} className="shrink-0">
          <button
            type="button"
            onClick={() => onChange(a.without(value))}
            aria-label={t('goingOut.interests.remove', 'Remove {{filter}}', { filter: a.label })}
            className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-badge bg-foreground px-2 text-13 font-bold text-background"
          >
            {a.label}
            <X size={14} aria-hidden />
          </button>
        </li>
      ))}
      <li className="shrink-0">
        <button
          type="button"
          onClick={() => onChange(NO_INTERESTS)}
          className="min-h-11 px-2 text-13 font-bold underline underline-offset-4"
        >
          {t('goingOut.interests.clear', 'Clear')}
        </button>
      </li>
    </ul>
  );
}
