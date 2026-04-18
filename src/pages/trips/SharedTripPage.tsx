import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { MapPin, AlertTriangle, Heart, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { TripMap } from '@/components/trips/TripMap';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { PlaceReactionBar } from '@/components/trips/PlaceReactionBar';
import { useTripReactions } from '@/hooks/useTripReactions';
import { PlaceCommentThread } from '@/components/trips/PlaceCommentThread';
import { useTripComments } from '@/hooks/useTripComments';
import { useAuth } from '@/hooks/useAuth';

interface SharedTripData {
  trip: {
    id: string;
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string;
    cover_image_url?: string | null;
  };
  permissions: {
    itinerary: boolean;
    budget: boolean;
    notes: boolean;
    packing: boolean;
  };
  days: Array<{
    id: string;
    date: string;
    title: string | null;
    notes: string | null;
    sort_order: number;
  }>;
  places: Array<{
    id: string;
    day_id: string | null;
    custom_name: string | null;
    custom_address: string | null;
    latitude: number | null;
    longitude: number | null;
    category: string | null;
    sort_order: number;
    start_time: string | null;
    end_time: string | null;
    venue_name: string | null;
    event_title: string | null;
    hotel_name: string | null;
    country_name: string | null;
    country_code: string | null;
    equality_score: number | null;
  }>;
  budget_items?: Array<{
    title: string;
    amount: number;
    currency: string;
    category: string | null;
    date: string | null;
  }>;
  notes?: Array<{
    title: string | null;
    content: string | null;
    category: string | null;
    is_pinned: boolean;
  }>;
  packing_items?: Array<{
    name: string;
    category: string | null;
    quantity: number;
    is_checked: boolean;
  }>;
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Stable deterministic gradient keyed off the trip id — mirrors the
 * TripCoverBand palette so a shared trip feels visually coherent with
 * the private planner view. Kept local to avoid pulling the full
 * TripCoverBand component (which expects TripWithDetails shape).
 */
function gradientForTrip(tripId: string): string {
  const palettes = [
    ['#7C3AED', '#DB2777'],
    ['#F59E0B', '#EF4444'],
    ['#06B6D4', '#3B82F6'],
    ['#10B981', '#6366F1'],
    ['#EC4899', '#8B5CF6'],
    ['#0EA5E9', '#22C55E'],
  ];
  let hash = 0;
  for (let i = 0; i < tripId.length; i += 1) {
    hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  const [a, b] = palettes[hash % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const [authOpen, setAuthOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-trip', token],
    queryFn: async (): Promise<SharedTripData> => {
      const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token! });
      if (error) throw error;
      return data as unknown as SharedTripData;
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  // Reactions from all viewers on this shared trip — bucketed per place_id.
  // Called unconditionally (before early returns) so hook order stays stable.
  const { data: reactionsByPlace } = useTripReactions(data?.trip?.id);
  const { data: commentsByPlace } = useTripComments(data?.trip?.id);
  const { user: viewer } = useAuth();

  // Log a view hit so the trip owner sees social proof. Fire-and-forget —
  // a failed track call must not block render. Once per token per session
  // (sessionStorage) so refreshes within a tab don't inflate the count.
  useEffect(() => {
    if (!token || !data?.trip) return;
    const sessionKey = `share-view-${token}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');

    let refererHost: string | null = null;
    try {
      if (document.referrer) refererHost = new URL(document.referrer).host;
    } catch {
      // ignore — malformed referrer
    }

    void supabase.rpc(
      'track_share_view' as never,
      { p_token: token, p_referer_host: refererHost } as never,
    );
  }, [token, data?.trip]);

  // Set document title + OG-style meta for social previews. Client-side only
  // (we don't have SSR); search crawlers that execute JS will still pick it up.
  useEffect(() => {
    if (!data?.trip) return;
    const title = `${data.trip.title} · Queer Guide`;
    document.title = title;
    const desc = data.trip.description || t('trips.shared.metaDescription');
    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    setMeta('description', desc);
    setMeta('og:title', title, true);
    setMeta('og:description', desc, true);
    setMeta('og:type', 'article', true);
    // Per-trip OG card rendered by the trip-og-image edge function.
    // Crawlers that execute JS will pick this up; for full server-side
    // injection we'd need prerender/SSR which is out of scope here.
    const ogImage = `https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/trip-og-image?trip_id=${data.trip.id}`;
    setMeta('og:image', ogImage, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:image', ogImage);
  }, [data?.trip, t]);

  if (isLoading) return <PageLoadingState count={4} />;

  if (error || !data || !data.trip) {
    return (
      <Box className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {t('trips.shared.notFoundTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('trips.shared.notFoundDescription')}
        </Typography>
      </Box>
    );
  }

  const { trip, permissions } = data;
  const days = data.days || [];
  const places = data.places || [];
  const budgetItems = data.budget_items || [];
  const notes = data.notes || [];
  const packingItems = data.packing_items || [];

  const unsafeCountries = new Map<string, number>();
  for (const p of places) {
    if (p.equality_score != null && p.equality_score < 40 && p.country_name) {
      unsafeCountries.set(p.country_name, p.equality_score);
    }
  }

  const placesByDay = new Map<string | null, typeof places>();
  for (const p of places) {
    const key = p.day_id;
    if (!placesByDay.has(key)) placesByDay.set(key, []);
    placesByDay.get(key)!.push(p);
  }

  const mapPlaces = places.map((p) => ({
    id: p.id,
    trip_id: trip.id,
    day_id: p.day_id,
    venue_id: null,
    event_id: null,
    hotel_id: null,
    custom_name: p.venue_name || p.event_title || p.hotel_name || p.custom_name,
    custom_address: p.custom_address,
    latitude: p.latitude,
    longitude: p.longitude,
    city_id: null,
    country_id: null,
    start_time: p.start_time,
    end_time: p.end_time,
    duration_minutes: null,
    notes: null,
    category: p.category,
    sort_order: p.sort_order,
    created_by: null,
    created_at: '',
    venues: p.venue_name ? { id: '', name: p.venue_name, category: p.category, images: null, address: p.custom_address } : null,
    events: p.event_title ? { id: '', title: p.event_title, event_type: p.category, start_date: null, end_date: null, images: null } : null,
    hotels: p.hotel_name ? { id: '', name: p.hotel_name, star_rating: null, images: null, address: p.custom_address } : null,
    cities: null,
    countries: p.country_name ? { id: '', name: p.country_name, code: p.country_code, equality_score: p.equality_score } : null,
  }));

  const mapDays = days.map((d) => ({
    id: d.id,
    trip_id: trip.id,
    date: d.date,
    title: d.title,
    notes: d.notes,
    sort_order: d.sort_order,
  }));

  const fallbackGradient = gradientForTrip(trip.id);
  const hasCover = !!trip.cover_image_url;

  return (
    <Box sx={{ mx: 'auto', pb: 6 }}>
      {/* Branded cover band — matches the private planner visually */}
      <Box
        sx={{
          position: 'relative',
          borderRadius: { xs: 0, sm: 3 },
          overflow: 'hidden',
          mb: 3,
          mx: { xs: 0, sm: 2 },
          mt: { xs: 0, sm: 2 },
          minHeight: { xs: 180, md: 220 },
          display: 'flex',
          alignItems: 'flex-end',
          background: hasCover ? undefined : fallbackGradient,
          backgroundImage: hasCover ? `url(${trip.cover_image_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)',
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            px: { xs: 2.5, md: 4 },
            py: { xs: 2.5, md: 3 },
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.25,
              py: 0.25,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.18)',
              color: 'common.white',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              mb: 1.25,
            }}
          >
            <Sparkles style={{ width: 12, height: 12 }} />
            {t('trips.shared.badge')}
          </Box>
          <Typography
            component="h1"
            sx={{
              color: 'common.white',
              fontFamily: 'var(--font-heading)',
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textShadow: '0 2px 16px rgba(0,0,0,0.4)',
            }}
          >
            {trip.title}
          </Typography>
          {trip.start_date && trip.end_date && (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.92)', mt: 1 }}>
              {format(new Date(trip.start_date), 'MMM d, yyyy')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
            </Typography>
          )}
          {trip.description && (
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255,255,255,0.85)',
                mt: 0.75,
                maxWidth: 640,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {trip.description}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 2 } }}>
        {/* Safety warnings */}
        {unsafeCountries.size > 0 && (
          <Card className="mb-3">
            <CardContent>
              <Box className="flex items-start gap-2" sx={{ bgcolor: 'warning.light', mx: -2, mt: -1, mb: -1, p: 2, borderRadius: 1 }}>
                <AlertTriangle size={16} style={{ color: theme.palette.warning?.main, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <Typography variant="subtitle2" fontWeight={600}>{t('trips.shared.safetyNotice')}</Typography>
                  {Array.from(unsafeCountries.entries()).map(([name, score]) => (
                    <Typography key={name} variant="body2">
                      {t('trips.shared.safetyCountry', { country: name, score })}
                    </Typography>
                  ))}
                </div>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        {mapPlaces.some((p) => p.latitude && p.longitude) && (
          <Box sx={{ height: 300, mb: 3, borderRadius: 2, overflow: 'hidden' }}>
            <TripMap places={mapPlaces as never} days={mapDays} />
          </Box>
        )}

        <Tabs defaultValue="itinerary">
          <TabsList>
            <TabsTrigger value="itinerary">{t('trips.shared.tabs.itinerary')}</TabsTrigger>
            {permissions.budget && budgetItems.length > 0 && <TabsTrigger value="budget">{t('trips.shared.tabs.budget')}</TabsTrigger>}
            {permissions.notes && notes.length > 0 && <TabsTrigger value="notes">{t('trips.shared.tabs.notes')}</TabsTrigger>}
            {permissions.packing && packingItems.length > 0 && <TabsTrigger value="packing">{t('trips.shared.tabs.packing')}</TabsTrigger>}
          </TabsList>

          <TabsContent value="itinerary">
            {days.map((day, dayIdx) => {
              const dayPlaces = placesByDay.get(day.id) || [];
              return (
                <Card key={day.id} className="mb-2">
                  <CardContent>
                    <Box className="flex items-center gap-2 mb-1">
                      <Badge variant="default">{t('trips.shared.dayLabel', { number: dayIdx + 1 })}</Badge>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {format(new Date(day.date), 'EEEE, MMM d')}
                      </Typography>
                      {day.title && (
                        <Typography variant="body2" color="text.secondary">— {day.title}</Typography>
                      )}
                    </Box>

                    {dayPlaces.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t('trips.shared.noPlaces')}
                      </Typography>
                    )}

                    {dayPlaces.map((place) => {
                      const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || t('trips.shared.unknownPlace');
                      return (
                        <Box
                          key={place.id}
                          sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 1 }}
                        >
                          <Box className="flex items-center gap-2">
                            <MapPin size={14} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                            <div className="flex-1 min-w-0">
                              <Typography variant="body2" fontWeight={500}>{name}</Typography>
                              {place.custom_address && (
                                <Typography variant="caption" color="text.secondary">{place.custom_address}</Typography>
                              )}
                            </div>
                            {place.category && <Badge variant="outline">{place.category}</Badge>}
                          </Box>
                          <PlaceReactionBar
                            tripId={trip.id}
                            placeId={place.id}
                            summary={reactionsByPlace?.get(place.id)}
                          />
                          <PlaceCommentThread
                            tripId={trip.id}
                            placeId={place.id}
                            comments={commentsByPlace?.get(place.id)}
                            isOwner={!!viewer && permissions?.canEdit}
                          />
                        </Box>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {(placesByDay.get(null) || []).length > 0 && (
              <Card className="mb-2">
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                    {t('trips.shared.unassigned')}
                  </Typography>
                  {(placesByDay.get(null) || []).map((place) => {
                    const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || t('trips.shared.unknownPlace');
                    return (
                      <Box
                        key={place.id}
                        className="flex items-center gap-2 py-1.5"
                        sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                      >
                        <MapPin size={14} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                        <Typography variant="body2" fontWeight={500} className="flex-1">{name}</Typography>
                        {place.category && <Badge variant="outline">{place.category}</Badge>}
                      </Box>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {permissions.budget && (
            <TabsContent value="budget">
              {budgetItems.map((item, i) => (
                <Box
                  key={i}
                  className="flex items-center justify-between py-2"
                  sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <div>
                    <Typography variant="body2" fontWeight={500}>{item.title}</Typography>
                    <Box className="flex items-center gap-1.5">
                      {item.category && <Badge variant="outline">{item.category}</Badge>}
                      {item.date && <Typography variant="caption" color="text.secondary">{item.date}</Typography>}
                    </Box>
                  </div>
                  <Typography variant="body2" fontWeight={700}>
                    {formatAmount(item.amount, item.currency)}
                  </Typography>
                </Box>
              ))}
            </TabsContent>
          )}

          {permissions.notes && (
            <TabsContent value="notes">
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {notes.map((note, i) => (
                  <Card key={i}>
                    <CardContent>
                      <Box className="flex items-start justify-between gap-1">
                        <Typography variant="subtitle2" fontWeight={600}>
                          {note.title || t('trips.shared.untitled')}
                        </Typography>
                        {note.category && <Badge variant="outline">{note.category}</Badge>}
                      </Box>
                      {note.content && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.5,
                            fontSize: 12,
                            display: '-webkit-box',
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {note.content}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </TabsContent>
          )}

          {permissions.packing && (
            <TabsContent value="packing">
              <SharedPackingList items={packingItems} />
            </TabsContent>
          )}
        </Tabs>

        {/* Conversion CTA: turn viewers into signups */}
        <Card
          className="mt-5"

        >
          <CardContent>
            <Box className="flex flex-col sm:flex-row items-center gap-3">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${theme.palette.brand?.main || '#DB2777'} 0%, ${theme.palette.accent?.main || '#F59E0B'} 100%)`,
                  color: 'common.white',
                }}
              >
                <Heart size={22} />
              </Box>
              <Box sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
                <Typography
                  sx={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t('trips.shared.ctaTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('trips.shared.ctaSubtitle')}
                </Typography>
              </Box>
              <Box className="flex gap-2 flex-shrink-0">
                <Button
                  variant="contained"
                  component={RouterLink}
                  to="/trips"
                  sx={{
                    bgcolor: 'brand.main',
                    '&:hover': { bgcolor: 'brand.dark' },
                    fontWeight: 700,
                  }}
                >
                  {t('trips.shared.ctaPrimary')}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setAuthOpen(true)}
                  sx={{ fontWeight: 600 }}
                >
                  {t('trips.shared.ctaSecondary')}
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 3 }}
        >
          {t('trips.shared.footer')}
        </Typography>
      </Box>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      {/* suppress unused lint for i18n instance used for potential future locale formatting */}
      <span hidden>{i18n.language}</span>
    </Box>
  );
}

function SharedPackingList({ items }: { items: SharedTripData['packing_items'] }) {
  const { t } = useTranslation();
  const list = useMemo(() => items || [], [items]);
  const grouped = new Map<string, typeof list>();
  for (const item of list) {
    const cat = item.category || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }
  const checked = list.filter((i) => i.is_checked).length;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('trips.shared.packed', { checked, total: list.length })}
      </Typography>
      {Array.from(grouped.entries()).map(([cat, catItems]) => (
        <Card key={cat} className="mb-2">
          <CardContent>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              {cat.charAt(0).toUpperCase() + cat.replace(/-/g, ' ').slice(1)}
            </Typography>
            {catItems.map((item, i) => (
              <Box key={i} className="flex items-center gap-2 py-0.5">
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '4px',
                    border: '2px solid',
                    borderColor: item.is_checked ? 'success.main' : 'divider',
                    bgcolor: item.is_checked ? 'success.main' : 'transparent',
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    textDecoration: item.is_checked ? 'line-through' : 'none',
                    color: item.is_checked ? 'text.disabled' : 'text.primary',
                  }}
                >
                  {item.name}
                  {item.quantity > 1 && ` (x${item.quantity})`}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export default SharedTripPage;
