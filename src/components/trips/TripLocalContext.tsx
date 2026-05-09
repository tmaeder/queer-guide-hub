import { Users, Map as MapIcon, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useTripLocalContext } from '@/hooks/useTripLocalContext';
import type { TripWithDetails } from '@/hooks/useTrips';

interface Props {
  trip: TripWithDetails;
}

/**
 * "Notable from {cities}" and "Queer neighborhoods" cards, auto-surfaced
 * on the Plan tab. Connects the trip to the rest of the platform's
 * LGBTQ+ content (personalities, queer villages) tied to the trip's
 * cities. Renders nothing while loading or if no linked content exists.
 */
export function TripLocalContext({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { data, isLoading } = useTripLocalContext(trip);

  if (isLoading || !data) return null;
  const { personalities, villages } = data;
  if (personalities.length === 0 && villages.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col gap-6">
      {personalities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} style={{ color: 'hsl(var(--foreground))' }} />
            <span className="font-bold text-base">
              {t('trips.localContext.personalitiesTitle', "Notable from where you're going")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {personalities.map((p) => (
              <Card
                key={p.id}
                onClick={() => navigate(`/personalities/${p.slug ?? p.id}`)}
                className="cursor-pointer hover:opacity-90"
              >
                <CardContent>
                  <Avatar style={{ width: 56, height: 56, margin: '0 auto 8px' }}>
                    <AvatarImage src={p.image_url ?? undefined} alt={p.name} />
                    <AvatarFallback>{p.name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="block font-semibold text-center text-xs truncate" style={{ lineHeight: 1.25 }}>
                    {p.name}
                  </div>
                  {p.city?.name && (
                    <div
                      className="block text-center text-muted-foreground truncate"
                      style={{ fontSize: 11 }}
                    >
                      {p.city.name}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {villages.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapIcon size={16} style={{ color: 'hsl(var(--foreground))' }} />
            <span className="font-bold text-base">
              {t('trips.localContext.villagesTitle', 'Queer neighborhoods')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {villages.map((v) => (
              <Card
                key={v.id}
                onClick={() => navigate(`/villages/${v.slug}`)}
                className="cursor-pointer hover:opacity-90"
              >
                <CardContent>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">{v.name}</span>
                    {v.is_featured && <Star size={12} style={{ fill: 'currentColor' }} />}
                    {v.city?.name && (
                      <span className="text-xs text-muted-foreground">· {v.city.name}</span>
                    )}
                  </div>
                  {v.description && (
                    <p
                      className="text-muted-foreground overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        fontSize: 13,
                      }}
                    >
                      {v.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
