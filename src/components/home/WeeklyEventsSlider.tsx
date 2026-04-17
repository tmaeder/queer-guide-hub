import React, { useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import { useEvents } from '@/hooks/useEvents';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatEventTime } from '@/lib/event-time';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { container } from '@/lib/sx';

type Event = {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  venue_name?: string | null;
  city?: string | null;
};

const Hairline = () => (
  <Box sx={{ height: '1px', bgcolor: 'currentColor', opacity: 0.12 }} />
);

const WeeklyEventsSlider = React.memo(() => {
  const { events, loading, fetchEvents } = useEvents(false);
  const isMobile = useIsMobile();
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();

  useEffect(() => {
    if (locationLoading) return;
    const now = new Date();
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    fetchEvents({
      dateRange: { start: now.toISOString(), end: weekEnd.toISOString() },
      limit: 40,
    });
  }, [userLocation, locationLoading, fetchEvents]);

  const { days, today } = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const daysArr = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return { days: daysArr, today: startOfDay(now) };
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    days.forEach((d) => map.set(d.toISOString(), []));
    (events as Event[]).forEach((ev) => {
      const start = new Date(ev.start_date);
      const key = days.find((d) => isSameDay(d, start))?.toISOString();
      if (key) map.get(key)!.push(ev);
    });
    // Sort each day's events by start time
    map.forEach((list) =>
      list.sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      ),
    );
    return map;
  }, [events, days]);

  if (loading) return null;
  const totalCount = (events as Event[]).length;
  if (totalCount === 0) return null;

  const headline = userLocation?.city ? `THIS WEEK · NEAR YOU` : `THIS WEEK`;

  return (
    <Box
      component="section"
      sx={{
        ...container,
        py: { xs: 4, md: 8 },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2,
        }}
      >
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
          All events →
        </Box>
      </Box>
      <Hairline />

      {/* Day columns */}
      <Box
        sx={{
          mt: { xs: 2, md: 4 },
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(7, 1fr)',
          },
          columnGap: { md: 2 },
          rowGap: { xs: 3, md: 0 },
        }}
      >
        {days.map((day) => {
          const items = eventsByDay.get(day.toISOString()) || [];
          const isToday = isSameDay(day, today);
          return (
            <Box
              key={day.toISOString()}
              sx={{
                minWidth: 0,
                borderLeft: { md: '1px solid' },
                borderColor: { md: 'currentColor' },
                opacity: 1,
                '& .day-border': { opacity: 0.12 },
                pl: { md: 2 },
                '&:first-of-type': { borderLeft: { md: 0 }, pl: { md: 0 } },
              }}
            >
              {/* Column header */}
              <Box
                sx={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.75rem',
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
                  fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                  lineHeight: 1,
                  mb: { xs: 1, md: 2 },
                  color: isToday ? 'hsl(var(--accent-warm))' : 'text.primary',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {format(day, 'd')}
              </Box>

              {/* Events stack */}
              {items.length === 0 ? (
                <Box
                  sx={{
                    color: 'text.secondary',
                    opacity: 0.35,
                    fontSize: '1rem',
                  }}
                >
                  —
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.slice(0, isMobile ? 6 : 4).map((ev) => (
                    <Box
                      key={ev.id}
                      component={LocalizedLink}
                      to={`/events/${ev.slug}`}
                      sx={{
                        display: 'block',
                        textDecoration: 'none',
                        color: 'text.primary',
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 0.7 },
                      }}
                    >
                      <Box
                        sx={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                          fontVariantNumeric: 'tabular-nums',
                          mb: 0.5,
                        }}
                      >
                        {formatEventTime(ev.start_date, ev.end_date)}
                      </Box>
                      <Box
                        sx={{
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                          fontWeight: 600,
                          fontSize: { xs: '1rem', md: '0.9375rem' },
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 0.5,
                        }}
                      >
                        {ev.title}
                      </Box>
                      {(ev.venue_name || ev.city) && (
                        <Box
                          sx={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.venue_name || ev.city}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
WeeklyEventsSlider.displayName = 'WeeklyEventsSlider';

export default WeeklyEventsSlider;
