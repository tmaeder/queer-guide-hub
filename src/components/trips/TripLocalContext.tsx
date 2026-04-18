import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { Users, Map as MapIcon, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent } from '@/components/ui/card';
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
    <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {personalities.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Users size={16} style={{ color: 'var(--brand-primary, #b60d3d)' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t('trips.localContext.personalitiesTitle', "Notable from where you're going")}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
              gap: 1.5,
            }}
          >
            {personalities.map((p) => (
              <Card
                key={p.id}
                onClick={() => navigate(`/personalities/${p.slug ?? p.id}`)}
                sx={{ cursor: 'pointer', '&:hover': { opacity: 0.9 } }}
              >
                <CardContent>
                  <Avatar
                    src={p.image_url ?? undefined}
                    alt={p.name}
                    sx={{ width: 56, height: 56, mx: 'auto', mb: 1 }}
                  >
                    {p.name[0]?.toUpperCase()}
                  </Avatar>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontWeight: 600,
                      textAlign: 'center',
                      lineHeight: 1.25,
                    }}
                    noWrap
                  >
                    {p.name}
                  </Typography>
                  {p.city?.name && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', textAlign: 'center', fontSize: 11 }}
                      noWrap
                    >
                      {p.city.name}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {villages.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <MapIcon size={16} style={{ color: 'var(--brand-primary, #b60d3d)' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t('trips.localContext.villagesTitle', 'Queer neighborhoods')}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5,
            }}
          >
            {villages.map((v) => (
              <Card
                key={v.id}
                onClick={() => navigate(`/villages/${v.slug}`)}
                sx={{ cursor: 'pointer', '&:hover': { opacity: 0.9 } }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {v.name}
                    </Typography>
                    {v.featured && <Star size={12} style={{ color: '#F59E0B' }} />}
                    {v.city?.name && (
                      <Typography variant="caption" color="text.secondary">
                        · {v.city.name}
                      </Typography>
                    )}
                  </Box>
                  {v.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: 13,
                      }}
                    >
                      {v.description}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
