import type { ReactNode } from 'react';
import { ArrowRight, MapPin, Star, Users } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useTripLocalContext } from '@/hooks/useTripLocalContext';
import type { TripWithDetails } from '@/hooks/useTrips';

interface Props {
  trip: TripWithDetails;
}

function Heading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-title font-bold">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
        {icon}
      </span>
      {children}
    </h3>
  );
}

/**
 * "Notable from {cities}" and "Queer neighborhoods", auto-surfaced on the Plan
 * tab. Connects the trip to the platform's personalities and queer villages in
 * the trip's cities. Renders nothing while loading or if nothing is linked.
 */
export function TripLocalContext({ trip }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useTripLocalContext(trip);

  if (isLoading || !data) return null;
  const { personalities, villages } = data;
  if (personalities.length === 0 && villages.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col gap-8">
      {personalities.length > 0 && (
        <section>
          <Heading icon={<Users className="h-4 w-4" aria-hidden />}>
            {t('trips.localContext.personalitiesTitle', "Notable from where you're going")}
          </Heading>
          <ul className="-mx-1 my-0 flex list-none snap-x gap-2 overflow-x-auto px-1 pb-2 pt-1">
            {personalities.map((p) => (
              <li key={p.id} className="w-32 shrink-0 snap-start">
                <LocalizedLink
                  to={`/personalities/${p.slug ?? p.id}`}
                  className="group flex h-full flex-col items-center gap-2 rounded-container bg-card px-2 pb-4 pt-4 text-center no-underline shadow-soft transition-transform duration-fast hover:-translate-y-1"
                >
                  <Avatar className="h-20 w-20 ring-4 ring-background transition-transform duration-normal group-hover:-rotate-3 group-hover:scale-105">
                    <AvatarImage src={p.image_url ?? undefined} alt="" className="object-cover" />
                    <AvatarFallback className="text-title font-bold">
                      {p.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="line-clamp-2 text-sm font-bold leading-tight text-foreground">
                    {p.name}
                  </span>
                  {p.city?.name && (
                    <span className="text-xs text-muted-foreground">{p.city.name}</span>
                  )}
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {villages.length > 0 && (
        <section>
          <Heading icon={<MapPin className="h-4 w-4" aria-hidden />}>
            {t('trips.localContext.villagesTitle', 'Queer neighborhoods')}
          </Heading>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
            {villages.map((v) => (
              <li key={v.id}>
                <LocalizedLink
                  to={`/villages/${v.slug}`}
                  className="group flex h-full gap-4 rounded-container bg-card p-6 no-underline shadow-soft transition-transform duration-fast hover:-translate-y-1"
                >
                  {/* A station on the line: track-pink disc, ink ring. */}
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-track-ring bg-track-pink text-track-ring transition-transform duration-normal group-hover:scale-110"
                  >
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-foreground">{v.name}</span>
                      {v.is_featured && (
                        <Star className="h-3 w-3 fill-current" aria-label="Featured" />
                      )}
                      {v.city?.name && (
                        <span className="rounded-badge bg-muted px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {v.city.name}
                        </span>
                      )}
                    </span>
                    {v.description && (
                      <span className="line-clamp-3 text-sm text-muted-foreground">
                        {v.description}
                      </span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                      {t('trips.localContext.explore', 'See the neighborhood')}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-1"
                        aria-hidden
                      />
                    </span>
                  </span>
                </LocalizedLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
