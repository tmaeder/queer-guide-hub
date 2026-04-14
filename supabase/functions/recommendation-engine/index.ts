import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, corsResponse, errorResponse, getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";

/**
 * Recommendation Engine
 *
 * Generates personalized destination recommendations based on:
 * - Favorites (cities, countries, venues)
 * - Profile travel_preferences (budget, safety threshold, interests)
 * - Behavioral events (page views, searches, booking clicks)
 * - Trip destinations
 * - Geo-detected location
 *
 * Results cached in user_recommendations table (5 min TTL for anonymous, 30 min for signed-in).
 */

const SIGNAL_WEIGHTS = {
  city_favorite: 10,
  country_favorite: 8,
  venue_favorite: 6,
  profile_preferences: 8,
  booking_completed: 15,
  booking_click: 5,
  page_view: 1,
  search_query: 3,
  trip_destination: 7,
  geo_location: 4,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const { userId, sessionId, recType = 'destination', limit = 10 } = body;

    if (!userId && !sessionId) {
      return errorResponse('userId or sessionId required', 400, req);
    }

    // Check cache first
    const cacheQuery = supabase
      .from('user_recommendations')
      .select('*')
      .eq('rec_type', recType)
      .gt('expires_at', new Date().toISOString())
      .order('score', { ascending: false })
      .limit(limit);

    if (userId) cacheQuery.eq('user_id', userId);
    else cacheQuery.eq('session_id', sessionId);

    const { data: cached } = await cacheQuery;
    if (cached && cached.length > 0) {
      return jsonResponse({ recommendations: cached, cached: true }, 200, req);
    }

    // Generate fresh recommendations
    const scores = new Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>();

    if (userId) {
      // 1. Favorite cities
      const { data: cityFavs } = await supabase
        .from('city_favorites')
        .select('city_id, cities(name, country_id, countries(equality_score, name, code))')
        .eq('user_id', userId);

      for (const fav of cityFavs || []) {
        const city = fav.cities as Record<string, unknown>;
        if (!city) continue;
        addScore(scores, 'city', fav.city_id, SIGNAL_WEIGHTS.city_favorite, 'favorited', { name: city.name });

        // Boost same-country cities
        if (city.country_id) {
          const { data: siblings } = await supabase
            .from('cities')
            .select('id, name')
            .eq('country_id', city.country_id)
            .neq('id', fav.city_id)
            .limit(5);
          for (const sib of siblings || []) {
            addScore(scores, 'city', sib.id, 5, 'same_country', { name: sib.name, country: (city.countries as Record<string, unknown>)?.name });
          }
        }
      }

      // 2. Favorite countries
      const { data: countryFavs } = await supabase
        .from('country_favorites')
        .select('country_id, countries(name, equality_score)')
        .eq('user_id', userId);

      for (const fav of countryFavs || []) {
        const country = fav.countries as Record<string, unknown>;
        if (!country) continue;

        // Get top cities in favorited country
        const { data: topCities } = await supabase
          .from('cities')
          .select('id, name')
          .eq('country_id', fav.country_id)
          .order('population', { ascending: false })
          .limit(3);

        for (const city of topCities || []) {
          addScore(scores, 'city', city.id, SIGNAL_WEIGHTS.country_favorite, 'country_favorited', { name: city.name, country: country.name });
        }
      }

      // 3. Profile travel preferences
      const { data: profile } = await supabase
        .from('profiles')
        .select('travel_preferences')
        .eq('user_id', userId)
        .single();

      const prefs = (profile?.travel_preferences || {}) as Record<string, unknown>;
      const safetyThreshold = (prefs.safety_threshold as number) || 0;

      // 4. Trip destinations
      const { data: trips } = await supabase
        .from('trip_places')
        .select('city_id, cities(name, country_id)')
        .eq('trips.owner_id', userId)
        .not('city_id', 'is', null)
        .limit(20);

      for (const tp of trips || []) {
        if (tp.city_id) {
          addScore(scores, 'city', tp.city_id, SIGNAL_WEIGHTS.trip_destination, 'trip_destination', { name: (tp.cities as Record<string, unknown>)?.name });
        }
      }

      // Apply safety filter
      if (safetyThreshold > 0) {
        for (const [key, entry] of scores) {
          const [entityType, entityId] = key.split(':');
          if (entityType === 'city') {
            const { data: cityData } = await supabase
              .from('cities')
              .select('country_id, countries(equality_score)')
              .eq('id', entityId)
              .single();
            const eqScore = (cityData?.countries as Record<string, unknown>)?.equality_score as number;
            if (eqScore != null && eqScore < safetyThreshold) {
              entry.score *= 0.3; // Deprioritize but don't hide
              entry.reasons.push('below_safety_threshold');
            }
          }
        }
      }
    }

    // 5. Behavioral signals (both anonymous and signed-in)
    const eventsQuery = supabase
      .from('user_events')
      .select('event_type, entity_type, entity_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (userId) eventsQuery.eq('user_id', userId);
    else if (sessionId) eventsQuery.eq('session_id', sessionId);

    const { data: events } = await eventsQuery;

    const now = Date.now();
    for (const event of events || []) {
      if (!event.entity_id) continue;
      const ageMs = now - new Date(event.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      let weight = 0;
      let halfLifeDays = 30;

      switch (event.event_type) {
        case 'page_view':
          weight = SIGNAL_WEIGHTS.page_view;
          halfLifeDays = 7;
          break;
        case 'search':
          weight = SIGNAL_WEIGHTS.search_query;
          halfLifeDays = 14;
          break;
        case 'booking_click':
          weight = SIGNAL_WEIGHTS.booking_click;
          halfLifeDays = 30;
          break;
      }

      if (weight > 0) {
        const decay = Math.pow(0.5, ageDays / halfLifeDays);
        const decayedWeight = weight * decay;
        addScore(scores, event.entity_type || 'city', event.entity_id, decayedWeight, event.event_type, event.metadata as Record<string, unknown>);
      }
    }

    // Convert to sorted array
    const recommendations = Array.from(scores.entries())
      .map(([key, entry]) => {
        const [entityType, entityId] = key.split(':');
        return {
          entity_type: entityType,
          entity_id: entityId,
          score: Math.round(entry.score * 100) / 100,
          reason: entry.reasons[0] || 'trending',
          metadata: entry.metadata,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Apply diversity: ensure at least 3 different countries in top 10 (skip for now, would need joins)

    // Cache results
    const ttlMinutes = userId ? 30 : 5;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    for (const rec of recommendations) {
      await supabase.from('user_recommendations').upsert({
        user_id: userId || null,
        session_id: userId ? null : sessionId,
        rec_type: recType,
        entity_type: rec.entity_type,
        entity_id: rec.entity_id,
        score: rec.score,
        reason: rec.reason,
        metadata: rec.metadata,
        expires_at: expiresAt,
      }, {
        onConflict: 'user_id,rec_type,entity_type,entity_id',
      });
    }

    return jsonResponse({ recommendations, cached: false }, 200, req);

  } catch (error) {
    console.error('Recommendation engine error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});

function addScore(
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
  entityType: string,
  entityId: string,
  weight: number,
  reason: string,
  metadata: Record<string, unknown>,
) {
  const key = `${entityType}:${entityId}`;
  const existing = scores.get(key);
  if (existing) {
    existing.score += weight;
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    Object.assign(existing.metadata, metadata);
  } else {
    scores.set(key, { score: weight, reasons: [reason], metadata });
  }
}
