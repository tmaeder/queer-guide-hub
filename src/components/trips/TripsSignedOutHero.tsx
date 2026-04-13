import { useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ShieldCheck, Map as MapIcon, Users, Luggage, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AuthDialog } from '@/components/auth/AuthDialog';

interface ValueBullet {
  icon: typeof ShieldCheck;
  titleKey: string;
  bodyKey: string;
}

const bullets: ValueBullet[] = [
  {
    icon: ShieldCheck,
    titleKey: 'trips.signedOut.bullets.safety.title',
    bodyKey: 'trips.signedOut.bullets.safety.body',
  },
  {
    icon: MapIcon,
    titleKey: 'trips.signedOut.bullets.itinerary.title',
    bodyKey: 'trips.signedOut.bullets.itinerary.body',
  },
  {
    icon: Users,
    titleKey: 'trips.signedOut.bullets.collaborate.title',
    bodyKey: 'trips.signedOut.bullets.collaborate.body',
  },
];

interface SampleTrip {
  titleKey: string;
  cities: string;
  days: number;
  gradient: string;
}

const sampleTrips: SampleTrip[] = [
  {
    titleKey: 'trips.signedOut.samples.berlin',
    cities: 'Berlin',
    days: 7,
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)',
  },
  {
    titleKey: 'trips.signedOut.samples.barcelona',
    cities: 'Barcelona',
    days: 4,
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
  },
  {
    titleKey: 'trips.signedOut.samples.bangkok',
    cities: 'Bangkok, Phuket',
    days: 10,
    gradient: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
  },
];

export function TripsSignedOutHero() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const brand = theme.palette.brand?.main || '#DB2777';
  const accent = theme.palette.accent?.main || '#F59E0B';

  return (
    <Container sx={{ py: { xs: 4, md: 8 } }}>
      <Box
        className="hero-gradient"
        sx={{
          overflow: 'hidden',
          px: { xs: 3, md: 6 },
          py: { xs: 5, md: 8 },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' },
            gap: { xs: 5, md: 6 },
            alignItems: 'center',
          }}
        >
          {/* Copy column */}
          <Box>
            <Badge
              variant="outline"
              sx={{
                mb: 2,
                borderColor: `${brand}40`,
                color: brand,
                bgcolor: `${brand}0d`,
                fontWeight: 600,
              }}
            >
              <Box
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                <Luggage style={{ width: 12, height: 12 }} />
                {t('trips.signedOut.badge')}
              </Box>
            </Badge>

            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                lineHeight: 1.1,
                mb: 2,
              }}
            >
              {t('trips.signedOut.title')}
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 480, fontSize: { md: '1.0625rem' } }}
            >
              {t('trips.signedOut.subtitle')}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 4 }}>
              <Button
                size="lg"
                variant="brand"
                onClick={() => setAuthOpen(true)}
                style={{ paddingLeft: 28, paddingRight: 28 }}
              >
                {t('trips.signedOut.primaryCta')}
                <ArrowRight style={{ width: 16, height: 16, marginLeft: 8 }} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  // Scroll to templates section further down /trips page,
                  // or open auth dialog if templates aren't visible yet.
                  setAuthOpen(true);
                }}
              >
                {t('trips.signedOut.secondaryCta')}
              </Button>
            </Box>

            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                p: 0,
                m: 0,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              {bullets.map(({ icon: Icon, titleKey, bodyKey }) => (
                <Box
                  key={titleKey}
                  component="li"
                  sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: `${brand}12`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon style={{ width: 18, height: 18, color: brand }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, mb: 0.25 }}
                    >
                      {t(titleKey)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(bodyKey)}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Preview column */}
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '1fr',
              gap: 2,
              position: 'relative',
            }}
          >
            {sampleTrips.map((sample, i) => (
              <Card
                key={sample.titleKey}
                style={{
                  overflow: 'hidden',
                  transform: `translateX(${i * 12}px) rotate(${(i - 1) * 0.8}deg)`,
                  transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <Box
                  sx={{
                    background: sample.gradient,
                    p: 2.5,
                    minHeight: 96,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        color: 'common.white',
                        lineHeight: 1.25,
                      }}
                    >
                      {t(sample.titleKey)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255,255,255,0.85)' }}
                    >
                      {sample.cities}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      alignSelf: 'flex-start',
                      bgcolor: 'rgba(255,255,255,0.2)',
                      color: 'common.white',
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    <ShieldCheck style={{ width: 11, height: 11 }} />
                    {t('trips.signedOut.safeLabel')}
                  </Box>
                </Box>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: accent,
                      }}
                    />
                    {t('trips.signedOut.daysLabel', { count: sample.days })}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </Container>
  );
}
