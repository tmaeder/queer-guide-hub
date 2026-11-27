import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Flag,
  Film,
  LockKeyhole,
  MapPin,
  PartyPopper,
  PawPrint,
  Sparkles,
  Trophy,
  Users,
} from '@/components/icons';
import type { LucideIcon } from '@/components/icons';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card } from '@/components/ui/card';
import { Image } from '@/components/ui/Image';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import {
  festivalDateSpan,
  festivalLengthDays,
  festivalPlace,
  festivalTiming,
  festivalTypeKey,
  type FestivalTypeKey,
} from '@/lib/festivals';
import type { Festival, FestivalEdition } from '@/hooks/useFestivals';
import { useFestivalTypeLabel } from './useFestivalTypeLabel';

const FESTIVAL_TYPE_ICON: Record<FestivalTypeKey, LucideIcon> = {
  pride: Flag,
  festival: Sparkles,
  fetish: LockKeyhole,
  bear: PawPrint,
  circuit: PartyPopper,
  film: Film,
  sports: Trophy,
  other: Users,
};

/**
 * One festival brand on the /festivals hub, showing its next edition.
 *
 * Card-overlay convention: the whole-card link is an absolutely-positioned
 * SIBLING of the card, never a wrapper (CLAUDE.md, axe nested-interactive).
 */
export const FestivalCard = memo(function FestivalCard({
  festival,
  edition,
  priority = false,
}: {
  festival: Festival;
  edition: FestivalEdition;
  priority?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocaleFor(i18n.language);
  const typeKey = festivalTypeKey(festival.festival_type);
  const typeLabel = useFestivalTypeLabel(typeKey);
  const image = resolveEntityImage('event', edition).url;
  const days = festivalLengthDays(edition);
  const timing = festivalTiming(edition);
  const place = festivalPlace(festival, i18n.language);

  const chip =
    timing.kind === 'now'
      ? { label: t('festivals.card.now', 'On now'), ink: true }
      : timing.kind === 'soon'
        ? {
            label:
              timing.inDays === 1
                ? t('festivals.card.tomorrow', 'Tomorrow')
                : t('festivals.card.inDays', 'In {{count}} days', { count: timing.inDays }),
            ink: false,
          }
        : null;

  return (
    <CardHoverEffect className="h-full">
      <Card hoverable="group" className="flex h-full flex-col overflow-hidden">
        <Image
          src={image}
          alt=""
          aspect="card"
          imageRole="cover"
          priority={priority}
          fallbackEntityType="event"
          fallbackIcon={FESTIVAL_TYPE_ICON[typeKey]}
          fallbackKey={festival.id}
        >
          {chip && (
            <span
              className={
                chip.ink
                  ? 'absolute left-2 top-2 rounded-badge bg-foreground px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-background'
                  : 'absolute left-2 top-2 rounded-badge bg-background/90 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-foreground'
              }
            >
              {chip.label}
            </span>
          )}
        </Image>
        <div className="flex flex-1 flex-col p-4">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {typeLabel}
          </p>
          <h3 className="mt-1 line-clamp-2 text-title font-bold leading-tight">{festival.name}</h3>
          <p className="mt-2 flex items-center gap-1.5 text-13 font-bold tabular-nums">
            <Calendar size={14} className="shrink-0" aria-hidden />
            <span>{festivalDateSpan(edition, locale)}</span>
            {days > 1 && (
              <span className="font-normal text-muted-foreground">
                {' · '}
                {t('festivals.days', { count: days })}
              </span>
            )}
          </p>
          {place && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={14} className="shrink-0" aria-hidden />
              <span className="truncate">{place}</span>
            </p>
          )}
          {edition.programme_size ? (
            <p className="mt-auto pt-2 text-13 font-bold">
              {t('festivals.editionEvents', { count: edition.programme_size })}
            </p>
          ) : null}
        </div>
      </Card>
      <LocalizedLink
        to={`/festivals/${festival.slug}`}
        aria-label={festival.name}
        className="absolute inset-0 rounded-container no-underline"
      />
    </CardHoverEffect>
  );
});
