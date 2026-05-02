import React, { useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import { useEvents } from '@/hooks/useEvents';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { container } from '@/lib/sx';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  useEffect(() => {
    if (locationLoading) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const range = { start: now.toISOString(), end: end.toISOString() };
    const city = userLocation?.city;
    if (city) {
      fetchEvents({ city, dateRange: range }, { signal }).then((res) => {
        if (!signal.aborted && res.fetched === 0) {
          fetchEvents({ dateRange: range }, { signal });
        }
      });
    } else {
      fetchEvents({ dateRange: range }, { signal });
    }
    return () => ctrl.abort();
  }, [userLocation?.city, locationLoading, fetchEvents]);

  const { hero, list, days, eventsByDay, today } = useMemo(() => {
    const all = events as Event[];
    const featured = all.find((e) => e.is_featured);
    const heroEvent = featured ?? all[0] ?? null;
    const rest = all.filter((e) => e.id !== heroEvent?.id).slice(0, 6);

    const now = new Date();
    const start = startOfDay(now);
    const daysArr = Array.from({ length: 14 }, (_, i) => addDays(start, i));
    const map = new Map<string, Event[]>();
    daysArr.forEach((d) => map.set(d.toISOString(), []));
    all.forEach((ev) => {
      const d = new Date(ev.start_date);
      const key = daysArr.find((x) => isSameDay(x, d))?.toISOString();
      if (key) map.get(key)!.push(ev);
    });
    map.forEach((lst) =>
      lst.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    );

    return {
      hero: heroEvent,
      list: rest,
      days: daysArr,
      eventsByDay: map,
      today: start,
    };
  }, [events]);

  if (loading) return null;
  if (!hero) return null;

  const monthLabel = format(new Date(), 'MMMM yyyy').toUpperCase();
  const heroHref = `/events/${hero.slug}`;
  const headline = userLocation?.city
    ? t('home.upcoming.titleNear', 'Upcoming Events Near You')
    : t('home.upcoming.title', 'Upcoming Events');

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
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              letterSpacing: '-0.01em',
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
          {t('common.browseAll', 'Browse all')} →
        </Box>
      </Box>
      <Hairline />

      {/* Hero + index */}
      <Box
        sx={{
          mt: { xs: 3, md: 4 },
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: list.length > 0 ? '3fr 2fr' : '1fr',
          },
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
              color: 'brand.main',
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

        {/* Index list (only when there are further events) */}
        {list.length > 0 && (
          <Box
            sx={{
              bgcolor: { md: 'action.hover' },
              p: { xs: 0, md: 3 },
              alignSelf: 'start',
            }}
          >
            {list.map((ev, idx) => (
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
            ))}
          </Box>
        )}
      </Box>

      {/* Upcoming-dates strip: only days that have events in the next 14 days */}
      {(() => {
        const activeDays = days.filter(
          (d) => (eventsByDay.get(d.toISOString()) || []).length > 0,
        );
        if (activeDays.length === 0) return null;
        return (
          <Box
            sx={{
              mt: { xs: 4, md: 6 },
              pt: { xs: 3, md: 4 },
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '0.75rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mb: { xs: 2, md: 3 },
              }}
            >
              {t('home.upcoming.next14', 'Next 14 days')}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(auto-fit, minmax(96px, 1fr))',
                  md: 'repeat(auto-fit, minmax(120px, 1fr))',
                },
                columnGap: { xs: 1.5, md: 2 },
                rowGap: 3,
              }}
            >
              {activeDays.map((day) => {
                const items = eventsByDay.get(day.toISOString()) || [];
                const isToday = isSameDay(day, today);
                const top = items[0];
                return (
                  <Box
                    key={day.toISOString()}
                    component={LocalizedLink}
                    to={`/events/${top.slug}`}
                    sx={{
                      display: 'block',
                      minWidth: 0,
                      textDecoration: 'none',
                      color: 'text.primary',
                      transition: 'opacity 0.2s',
                      '&:hover': { opacity: 0.7 },
                    }}
                  >
                    <Box
                      sx={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: '0.6875rem',
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                      }}
                    >
                      {format(day, 'EEE')}
                    </Box>
                    <Box
                      sx={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 300,
                        fontSize: { xs: '1.5rem', md: '1.75rem' },
                        lineHeight: 1,
                        mb: 1,
                        color: isToday ? 'brand.main' : 'text.primary',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {format(day, 'd')}
                    </Box>
                    <Box
                      sx={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {top.title}
                    </Box>
                    {items.length > 1 && (
                      <Box
                        sx={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '0.6875rem',
                          color: 'text.secondary',
                          mt: 0.5,
                        }}
                      >
                        +{items.length - 1}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })()}
    </Box>
  );
};

export default RegionalEventsCalendar;
