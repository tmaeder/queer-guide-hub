import React, { useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import { useEvents } from '@/hooks/useEvents';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { format } from 'date-fns';
import { container } from '@/lib/sx';

type Event = {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  image_url?: string | null;
  featured?: boolean | null;
};

const Hairline = () => (
  <Box sx={{ height: '1px', bgcolor: 'currentColor', opacity: 0.12 }} />
);

const RegionalEventsCalendar: React.FC = () => {
  const { events, loading, fetchEvents } = useEvents(false);
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();

  useEffect(() => {
    if (locationLoading) return;
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const range = { start: now.toISOString(), end: end.toISOString() };
    const city = userLocation?.city;
    if (city) {
      fetchEvents({ city, dateRange: range }).then((res) => {
        if (res.fetched === 0) fetchEvents({ dateRange: range });
      });
    } else {
      fetchEvents({ dateRange: range });
    }
  }, [userLocation?.city, locationLoading, fetchEvents]);

  const { hero, list } = useMemo(() => {
    const all = events as Event[];
    const featured = all.find((e) => e.featured);
    const heroEvent = featured ?? all[0] ?? null;
    const rest = all.filter((e) => e.id !== heroEvent?.id).slice(0, 6);
    return { hero: heroEvent, list: rest };
  }, [events]);

  if (loading) return null;
  if (!hero) return null;

  const monthLabel = format(new Date(), 'MMMM yyyy').toUpperCase();
  const heroHref = `/events/${hero.slug}`;
  const headline = userLocation?.city
    ? `UPCOMING · NEAR YOU`
    : `UPCOMING`;

  return (
    <Box component="section" sx={{ ...container, py: { xs: 4, md: 8 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
          <Box
            component="h2"
            sx={{
              m: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
              lineHeight: 1.1,
            }}
          >
            {headline}
          </Box>
          <Box
            sx={{
              fontFamily: "'Inter', sans-serif",
              fontSize: { xs: '0.8125rem', md: '0.875rem' },
              color: 'text.secondary',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {monthLabel}
          </Box>
        </Box>
        <Box
          component={LocalizedLink}
          to="/events"
          sx={{
            fontFamily: "'Inter', sans-serif",
            fontSize: { xs: '0.8125rem', md: '0.875rem' },
            color: 'text.primary',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
            '&:hover': { opacity: 0.7 },
          }}
        >
          Browse all →
        </Box>
      </Box>
      <Hairline />

      {/* Hero + index */}
      <Box
        sx={{
          mt: { xs: 3, md: 4 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' },
          columnGap: { md: 4 },
          rowGap: { xs: 3, md: 0 },
        }}
      >
        {/* Hero */}
        <Box
          component={LocalizedLink}
          to={heroHref}
          sx={{
            display: 'block',
            textDecoration: 'none',
            color: 'text.primary',
            transition: 'opacity 0.2s',
            '&:hover': { opacity: 0.85 },
          }}
        >
          {hero.image_url && (
            <Box
              sx={{
                width: '100%',
                aspectRatio: '4 / 3',
                overflow: 'hidden',
                bgcolor: 'action.hover',
                mb: 2,
              }}
            >
              <Box
                component="img"
                src={hero.image_url}
                alt=""
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </Box>
          )}
          <Box
            sx={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: { xs: '0.875rem', md: '1rem' },
              color: 'hsl(var(--accent-warm))',
              fontVariantNumeric: 'tabular-nums',
              mb: 1,
            }}
          >
            {format(new Date(hero.start_date), 'dd MMM').toUpperCase()}
          </Box>
          <Box
            component="h3"
            sx={{
              m: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(1.5rem, 3.2vw, 2.5rem)',
              lineHeight: 1.15,
              mb: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {hero.title}
          </Box>
          {(hero.venue_name || hero.city) && (
            <Box
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontSize: { xs: '0.875rem', md: '0.9375rem' },
                color: 'text.secondary',
              }}
            >
              {[hero.venue_name, hero.city].filter(Boolean).join(' · ')}
            </Box>
          )}
        </Box>

        {/* Index list */}
        <Box
          sx={{
            bgcolor: { md: 'action.hover' },
            p: { xs: 0, md: 3 },
            alignSelf: 'start',
          }}
        >
          {list.length === 0 ? (
            <Box sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              No further events scheduled.
            </Box>
          ) : (
            list.map((ev, idx) => (
              <React.Fragment key={ev.id}>
                {idx > 0 && <Hairline />}
                <Box
                  component={LocalizedLink}
                  to={`/events/${ev.slug}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'baseline',
                    columnGap: 2,
                    py: { xs: 1.5, md: 2 },
                    textDecoration: 'none',
                    color: 'text.primary',
                    '&:hover .qg-ev-title': { opacity: 0.7 },
                    '&:hover .qg-ev-arrow': {
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {format(new Date(ev.start_date), 'dd MMM').toUpperCase()}
                  </Box>
                  <Box
                    className="qg-ev-title"
                    sx={{
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontWeight: 600,
                      fontSize: { xs: '0.9375rem', md: '1rem' },
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {ev.title}
                  </Box>
                  <Box
                    className="qg-ev-arrow"
                    sx={{
                      color: 'text.secondary',
                      transition: 'transform 0.2s',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    →
                  </Box>
                </Box>
              </React.Fragment>
            ))
          )}
        </Box>
      </Box>

    </Box>
  );
};

export default RegionalEventsCalendar;
