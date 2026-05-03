import { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin, AlertTriangle, Heart, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { TripMap } from '@/components/trips/TripMap';
import { AuthDialog } from '@/components/auth/AuthDialog';
import { PlaceReactionBar } from '@/components/trips/PlaceReactionBar';
import { useTripReactions } from '@/hooks/useTripReactions';
import { PlaceCommentThread } from '@/components/trips/PlaceCommentThread';
import { useTripComments } from '@/hooks/useTripComments';
import { useAuth } from '@/hooks/useAuth';
import { resolveTripTitle } from '@/components/trips/tripTitle';

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
    canEdit?: boolean;
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

function gradientForTrip(tripId: string): string {
  const palettes = [
    ['#7C3AED', 'hsl(var(--brand))'],
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

  const { data: reactionsByPlace } = useTripReactions(data?.trip?.id);
  const { data: commentsByPlace } = useTripComments(data?.trip?.id);
  const { user: viewer } = useAuth();

  useEffect(() => {
    if (!token || !data?.trip) return;
    const sessionKey = `share-view-${token}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');

    let refererHost: string | null = null;
    try {
      if (document.referrer) refererHost = new URL(document.referrer).host;
    } catch {
      // ignore
    }

    void supabase.rpc(
      'track_share_view' as never,
      { p_token: token, p_referer_host: refererHost } as never,
    );
  }, [token, data?.trip]);

  useEffect(() => {
    if (!data?.trip) return;
    const resolved = resolveTripTitle(
      { title: data.trip.title, primary_city_name: null },
      t,
    );
    const title = `${resolved} · Queer Guide`;
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
    const ogImage = `https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/trip-og-image?trip_id=${data.trip.id}`;
    setMeta('og:image', ogImage, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:image', ogImage);
  }, [data?.trip, t]);

  if (isLoading) return <PageLoadingState count={4} />;

  if (error || !data || !data.trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h5 className="text-2xl font-bold mb-2">{t('trips.shared.notFoundTitle')}</h5>
        <p className="text-sm text-muted-foreground">{t('trips.shared.notFoundDescription')}</p>
      </div>
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
    <div className="mx-auto pb-6">
      {/* Branded cover band */}
      <div
        className="relative rounded-none sm:rounded-xl overflow-hidden mb-3 sm:mx-2 sm:mt-2 min-h-[180px] md:min-h-[220px] flex items-end bg-cover bg-center"
        style={{
          background: hasCover ? undefined : fallbackGradient,
          backgroundImage: hasCover ? `url(${trip.cover_image_url})` : undefined,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)' }}
        />
        <div className="relative z-[1] w-full px-[1.25rem] md:px-4 py-[1.25rem] md:py-3">
          <div
            className="inline-flex items-center gap-0.5 px-[0.625rem] rounded-full text-white text-[0.7rem] font-bold uppercase tracking-[0.04em] mb-[0.3125rem]"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', padding: '1px 10px' }}
          >
            <Sparkles style={{ width: 12, height: 12 }} />
            {t('trips.shared.badge')}
          </div>
          <h1
            className="text-white text-[1.75rem] md:text-[2.25rem] font-extrabold"
            style={{
              fontFamily: 'var(--font-heading)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textShadow: '0 2px 16px rgba(0,0,0,0.4)',
            }}
          >
            {resolveTripTitle({ title: trip.title, primary_city_name: null }, t)}
          </h1>
          {trip.start_date && trip.end_date && (
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.92)' }}>
              {format(new Date(trip.start_date), 'MMM d, yyyy')} – {format(new Date(trip.end_date), 'MMM d, yyyy')}
            </p>
          )}
          {trip.description && (
            <p
              className="text-sm mt-[0.1875rem] max-w-[640px] overflow-hidden"
              style={{
                color: 'rgba(255,255,255,0.85)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {trip.description}
            </p>
          )}
        </div>
      </div>

      <div className="px-2">
        {/* Safety warnings */}
        {unsafeCountries.size > 0 && (
          <Card className="mb-3">
            <CardContent>
              <div className="flex items-start gap-2 -mx-2 -mt-1 -mb-1 p-2 rounded bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{t('trips.shared.safetyNotice')}</p>
                  {Array.from(unsafeCountries.entries()).map(([name, score]) => (
                    <p key={name} className="text-sm">
                      {t('trips.shared.safetyCountry', { country: name, score })}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        {mapPlaces.some((p) => p.latitude && p.longitude) && (
          <div className="h-[300px] mb-3 rounded-lg overflow-hidden">
            <TripMap places={mapPlaces as never} days={mapDays} />
          </div>
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
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="default">{t('trips.shared.dayLabel', { number: dayIdx + 1 })}</Badge>
                      <p className="text-sm font-semibold">{format(new Date(day.date), 'EEEE, MMM d')}</p>
                      {day.title && <p className="text-sm text-muted-foreground">— {day.title}</p>}
                    </div>

                    {dayPlaces.length === 0 && (
                      <p className="text-sm text-muted-foreground py-1">{t('trips.shared.noPlaces')}</p>
                    )}

                    {dayPlaces.map((place) => {
                      const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || t('trips.shared.unknownPlace');
                      return (
                        <div key={place.id} className="border-b border-border py-1">
                          <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{name}</p>
                              {place.custom_address && (
                                <span className="text-xs text-muted-foreground">{place.custom_address}</span>
                              )}
                            </div>
                            {place.category && <Badge variant="outline">{place.category}</Badge>}
                          </div>
                          <PlaceReactionBar
                            tripId={trip.id}
                            placeId={place.id}
                            summary={reactionsByPlace?.get(place.id)}
                          />
                          <PlaceCommentThread
                            tripId={trip.id}
                            placeId={place.id}
                            comments={commentsByPlace?.get(place.id)}
                            isOwner={!!viewer && !!permissions?.canEdit}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {(placesByDay.get(null) || []).length > 0 && (
              <Card className="mb-2">
                <CardContent>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">{t('trips.shared.unassigned')}</p>
                  {(placesByDay.get(null) || []).map((place) => {
                    const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || t('trips.shared.unknownPlace');
                    return (
                      <div key={place.id} className="flex items-center gap-2 py-1.5 border-b border-border">
                        <MapPin size={14} className="text-muted-foreground flex-shrink-0" />
                        <p className="text-sm font-medium flex-1">{name}</p>
                        {place.category && <Badge variant="outline">{place.category}</Badge>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {permissions.budget && (
            <TabsContent value="budget">
              {budgetItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <div className="flex items-center gap-1.5">
                      {item.category && <Badge variant="outline">{item.category}</Badge>}
                      {item.date && <span className="text-xs text-muted-foreground">{item.date}</span>}
                    </div>
                  </div>
                  <p className="text-sm font-bold">{formatAmount(item.amount, item.currency)}</p>
                </div>
              ))}
            </TabsContent>
          )}

          {permissions.notes && (
            <TabsContent value="notes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {notes.map((note, i) => (
                  <Card key={i}>
                    <CardContent>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-semibold">{note.title || t('trips.shared.untitled')}</p>
                        {note.category && <Badge variant="outline">{note.category}</Badge>}
                      </div>
                      {note.content && (
                        <p
                          className="text-xs text-muted-foreground mt-0.5 overflow-hidden"
                          style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}
                        >
                          {note.content}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {permissions.packing && (
            <TabsContent value="packing">
              <SharedPackingList items={packingItems} />
            </TabsContent>
          )}
        </Tabs>

        {/* Conversion CTA */}
        <Card className="mt-5">
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                style={{
                  background: `linear-gradient(135deg, hsl(var(--brand)) 0%, #F59E0B 100%)`,
                }}
              >
                <Heart size={22} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p
                  className="font-extrabold text-[1.1rem]"
                  style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.01em' }}
                >
                  {t('trips.shared.ctaTitle')}
                </p>
                <p className="text-sm text-muted-foreground">{t('trips.shared.ctaSubtitle')}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button asChild variant="brand" className="font-bold">
                  <RouterLink to="/trips">{t('trips.shared.ctaPrimary')}</RouterLink>
                </Button>
                <Button variant="outline" onClick={() => setAuthOpen(true)} className="font-semibold">
                  {t('trips.shared.ctaSecondary')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground block text-center mt-3">{t('trips.shared.footer')}</p>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <span hidden>{i18n.language}</span>
    </div>
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
      <p className="text-sm text-muted-foreground mb-2">
        {t('trips.shared.packed', { checked, total: list.length })}
      </p>
      {Array.from(grouped.entries()).map(([cat, catItems]) => (
        <Card key={cat} className="mb-2">
          <CardContent>
            <p className="text-sm font-semibold mb-0.5">
              {cat.charAt(0).toUpperCase() + cat.replace(/-/g, ' ').slice(1)}
            </p>
            {catItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <div
                  className="w-4 h-4 rounded border-2"
                  style={{
                    borderColor: item.is_checked ? '#16a34a' : 'hsl(var(--border))',
                    backgroundColor: item.is_checked ? '#16a34a' : 'transparent',
                  }}
                />
                <p
                  className="text-sm"
                  style={{
                    textDecoration: item.is_checked ? 'line-through' : 'none',
                    color: item.is_checked ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                  }}
                >
                  {item.name}
                  {item.quantity > 1 && ` (x${item.quantity})`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export default SharedTripPage;
