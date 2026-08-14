import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { PeopleMatchShared } from '@/hooks/usePeopleDiscovery';
import { SignalChips } from './SignalChips';

export interface PersonCardData {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  score?: number;
  shared?: PeopleMatchShared;
}

/** Initials fallback — 0 of 17 profiles carry an avatar, so this is the norm. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Person card for the people rails and grids.
 *
 * Brought onto the house card pattern (`CardHoverEffect` > `Card` + overlay
 * link) — it was the last entity card still hand-rolling a bordered `<Link>`,
 * so it alone missed the misregistered plate, the group-hover surface and the
 * skeleton contract every other card has.
 *
 * The click target is an absolutely-positioned SIBLING of `<Card>`, never a
 * wrapper: a person card carries chips today and will carry follow/message
 * buttons, and nesting those inside an `<a>` is invalid HTML plus an axe
 * `nested-interactive` violation. `no-underline` is load-bearing — the
 * unlayered `li a:not(.no-underline)` rule in index.css would otherwise force
 * `position: relative` and collapse the overlay.
 */
export const PersonCard = memo(function PersonCard({
  person,
  fullWidth = false,
  loading = false,
}: {
  person?: PersonCardData;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const width = fullWidth ? 'w-full' : 'w-40 shrink-0';

  if (loading || !person) {
    return <Skeleton className={`h-44 ${width}`} />;
  }

  const name = person.displayName ?? t('people.card.member', 'Member');

  return (
    <CardHoverEffect className={width}>
      <Card hoverable="group" className="h-full overflow-hidden p-4">
        <div className="flex flex-col gap-2">
          {person.avatarUrl ? (
            <img
              src={person.avatarUrl}
              alt=""
              loading="lazy"
              className="h-16 w-16 rounded-full border-[3px] border-foreground object-cover object-top"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-foreground bg-muted text-15 font-bold text-muted-foreground"
              aria-hidden
            >
              {initials(name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-title font-bold leading-tight">{name}</div>
            {typeof person.score === 'number' && person.score > 0 ? (
              <div className="mt-1 inline-block border border-foreground bg-background px-1.5 py-0.5 text-2xs font-bold uppercase tracking-label">
                {t('people.card.match', {
                  defaultValue: '{{score}}% match',
                  score: person.score,
                })}
              </div>
            ) : null}
            <SignalChips shared={person.shared} className="mt-1.5" max={2} />
          </div>
        </div>
      </Card>
      {/* Card-wide click target. Overlay sibling, not a wrapper — see above. */}
      <LocalizedLink
        to={`/user/${person.userId}`}
        aria-label={name}
        className="absolute inset-0 rounded-container no-underline"
      />
    </CardHoverEffect>
  );
});
