import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { detailHref } from '@/lib/searchRoutes';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useEntityPersonalities } from '@/hooks/useEntityPersonalities';
import type { Personality } from '@/hooks/usePersonalities';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { formatProfession } from '@/lib/professionDisplay';

interface Props {
  cityId?: string | null;
  countryId?: string | null;
  cityName?: string | null;
  limit?: number;
}

/**
 * Editorial cross-link band on city / country / village detail pages.
 * "Queer voices from {city}" — personalities tied to this place by birth or
 * death relation. Horizontal portrait rail, reuses our monochrome card design.
 * Renders nothing when there's no entity to query or no rows returned, so the
 * editorial section it sits inside cleanly collapses.
 */
export function PersonalitiesForEntity({ cityId, countryId, cityName, limit = 8 }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useEntityPersonalities({ cityId, countryId, limit });

  if (!cityId && !countryId) return null;
  if (isLoading) return <RailSkeleton />;
  if (!data || data.length === 0) return null;

  const seeAllHref = cityId
    ? `/personalities?cityId=${cityId}`
    : `/personalities?countryId=${countryId}`;
  const heading = cityName
    ? t('discovery.personalities.cityHeading', 'Queer voices from {{city}}', { city: cityName })
    : t('discovery.personalities.heading', 'Queer voices from here');

  return (
    <ScrollArea aria-label={heading} className="-mx-4 px-4">
      <ul className="flex gap-4 pb-4">
        {data.map((p) => {
          // Strict: require a canonical slug — skip a personality with only an id.
          const href = detailHref({ type: 'personality', slug: p.slug, id: p.id });
          if (!href) return null;
          return (
            <li key={p.id} className="w-44 shrink-0 snap-start">
              <PersonalityRailCard personality={p} href={href} />
            </li>
          );
        })}
        <li className="flex w-44 shrink-0 items-center justify-center">
          <LocalizedLink
            to={seeAllHref}
            className="inline-flex items-center gap-2 text-13 font-medium text-muted-foreground no-underline hover:text-foreground"
          >
            {t('discovery.personalities.seeAll', 'See all')}
            <ArrowRight size={14} />
          </LocalizedLink>
        </li>
      </ul>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function PersonalityRailCard({ personality, href }: { personality: Personality; href: string }) {
  const src = resolveImageUrl({ imageUrl: personality.image_url, preferThumb: true });
  const era = formatEra(personality);
  return (
    <LocalizedLink
      to={href}
      aria-label={personality.name}
      className="group flex h-full flex-col gap-2 no-underline"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-container border bg-muted">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-headline font-bold text-muted-foreground">
            {getInitials(personality.name)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 px-1">
        <p className="truncate text-13 font-semibold leading-tight text-foreground">
          {personality.name}
        </p>
        {personality.profession ? (
          <p className="truncate text-2xs uppercase tracking-[0.1em] text-muted-foreground">
            {formatProfession(personality.profession)}
          </p>
        ) : null}
        {era ? (
          <p className="truncate text-2xs text-muted-foreground tabular-nums">{era}</p>
        ) : null}
      </div>
    </LocalizedLink>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-4 pb-4" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-44 shrink-0">
          <Skeleton variant="rectangular" height={176} className="rounded-container" />
          <div className="mt-2 h-3 w-2/3 bg-muted" />
          <div className="mt-2 h-2 w-1/2 bg-muted" />
        </div>
      ))}
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatEra(p: Personality): string | null {
  if (p.is_living) return 'Living';
  const birth = p.birth_date ? new Date(p.birth_date).getFullYear() : null;
  const death = p.death_date ? new Date(p.death_date).getFullYear() : null;
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
}
