import { corsResponse, errorResponse, getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

/**
 * Recommendation Engine
 *
 * Generates personalized destination recommendations from:
 * - Favorites (city / country / venue) with recency decay
 * - Profile travel preferences (min_equality_score hard filter, safety_threshold soft)
 * - Behavioral events (page views, searches, booking clicks) with time decay
 * - Trip places (per-destination history)
 * - Geo-detected location
 * - Pride event proximity (mechanic A boost — next 120d)
 * - Social graph (cities favorited by users the current user follows)
 * - Seasonality (when city_climate_monthly is populated)
 *
 * Cached in user_recommendations with `signals_version` so a deploy that changes
 * SIGNAL_WEIGHTS or SIGNALS_VERSION below auto-invalidates stale rows.
 * TTL: 60 min signed-in, 5 min anonymous.
 */

/**
 * Bump SIGNALS_VERSION whenever SIGNAL_WEIGHTS, the scoring shape, or any source
 * query changes in a way that would render cached rows misleading. Reads with a
 * different (or NULL) version are treated as expired.
 */
const SIGNALS_VERSION = "v2-2026-05-26";

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
  pride_proximity: 7,
  social_graph: 5,
  seasonality_match: 6,
};

const SIGNED_IN_TTL_MIN = 60;
const ANON_TTL_MIN = 5;

const FAVORITE_HALF_LIFE_DAYS = 180;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const { userId, sessionId, recType = "destination", limit = 10 } = body;

    if (!userId && !sessionId) {
      return errorResponse("userId or sessionId required", 400, req);
    }

    // ---------- cache read ----------
    const cacheQuery = supabase
      .from("user_recommendations")
      .select("*")
      .eq("rec_type", recType)
      .eq("signals_version", SIGNALS_VERSION)
      .gt("expires_at", new Date().toISOString())
      .order("score", { ascending: false })
      .limit(limit);

    if (userId) cacheQuery.eq("user_id", userId);
    else cacheQuery.eq("session_id", sessionId);

    const { data: cached } = await cacheQuery;
    if (cached && cached.length > 0) {
      return jsonResponse({ recommendations: cached, cached: true }, 200, req);
    }

    // ---------- score map ----------
    const scores = new Map<
      string,
      { score: number; reasons: string[]; metadata: Record<string, unknown> }
    >();

    let minEqualityFloor = 0;

    if (userId) {
      // load profile once (used by safety filter + min_equality_score hard filter)
      const { data: profile } = await supabase
        .from("profiles")
        .select("travel_preferences")
        .eq("user_id", userId)
        .single();

      const prefs = (profile?.travel_preferences || {}) as Record<string, unknown>;
      const safetyThreshold = (prefs.safety_threshold as number) || 0;
      const minEquality = (prefs.min_equality_score as number) || 0;
      minEqualityFloor = minEquality;

      // 1. Favorite cities — with recency decay on created_at
      const { data: cityFavs } = await supabase
        .from("city_favorites")
        .select(
          "city_id, created_at, cities(name, country_id, countries(equality_score, name, code))",
        )
        .eq("user_id", userId);

      for (const fav of cityFavs || []) {
        const city = fav.cities as Record<string, unknown> | null;
        if (!city) continue;
        const decay = recencyDecay(fav.created_at, FAVORITE_HALF_LIFE_DAYS);
        addScore(
          scores,
          "city",
          fav.city_id,
          SIGNAL_WEIGHTS.city_favorite * decay,
          `favorited:${city.name ?? "city"}`,
          { name: city.name },
        );

        // Boost same-country cities (lighter, also decayed)
        if (city.country_id) {
          const { data: siblings } = await supabase
            .from("cities")
            .select("id, name")
            .eq("country_id", city.country_id)
            .neq("id", fav.city_id)
            .limit(5);
          for (const sib of siblings || []) {
            addScore(scores, "city", sib.id, 5 * decay, "same_country", {
              name: sib.name,
              country: (city.countries as Record<string, unknown>)?.name,
            });
          }
        }
      }

      // 2. Favorite countries — with recency decay
      const { data: countryFavs } = await supabase
        .from("country_favorites")
        .select("country_id, created_at, countries(name, equality_score)")
        .eq("user_id", userId);

      for (const fav of countryFavs || []) {
        const country = fav.countries as Record<string, unknown> | null;
        if (!country) continue;
        const decay = recencyDecay(fav.created_at, FAVORITE_HALF_LIFE_DAYS);
        const { data: topCities } = await supabase
          .from("cities")
          .select("id, name")
          .eq("country_id", fav.country_id)
          .order("population", { ascending: false })
          .limit(3);
        for (const city of topCities || []) {
          addScore(
            scores,
            "city",
            city.id,
            SIGNAL_WEIGHTS.country_favorite * decay,
            `country_favorited:${country.name ?? "country"}`,
            { name: city.name, country: country.name },
          );
        }
      }

      // 3. Trip places — already-planned destinations strongly weighted
      const { data: trips } = await supabase
        .from("trip_places")
        .select("city_id, cities(name, country_id)")
        .eq("trips.owner_id", userId)
        .not("city_id", "is", null)
        .limit(20);

      for (const tp of trips || []) {
        if (!tp.city_id) continue;
        addScore(
          scores,
          "city",
          tp.city_id,
          SIGNAL_WEIGHTS.trip_destination,
          "trip_destination",
          { name: (tp.cities as Record<string, unknown>)?.name },
        );
      }

      // 4. Social graph — boost cities favorited by people the user follows
      await applySocialGraphSignal(supabase, userId, scores);

      // 5. Pride proximity — boost cities hosting pride events in next 120d
      await applyPrideProximitySignal(supabase, scores);

      // 6. Seasonality — boost cities matching hemisphere weather preference
      //    (defensive: skips silently if city_climate_monthly isn't deployed)
      await applySeasonalitySignal(supabase, scores).catch(() => undefined);

      // Apply safety soft-deprioritization (legacy preference shape)
      if (safetyThreshold > 0) {
        await deprioritizeByEqualityScore(supabase, scores, safetyThreshold);
      }
    }

    // 7. Behavioral signals (anonymous + signed-in)
    const eventsQuery = supabase
      .from("user_events")
      .select("event_type, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (userId) eventsQuery.eq("user_id", userId);
    else if (sessionId) eventsQuery.eq("session_id", sessionId);

    const { data: events } = await eventsQuery;
    const now = Date.now();
    for (const event of events || []) {
      if (!event.entity_id) continue;
      const ageDays =
        (now - new Date(event.created_at).getTime()) / (1000 * 60 * 60 * 24);

      let weight = 0;
      let halfLifeDays = 30;
      switch (event.event_type) {
        case "page_view":
          weight = SIGNAL_WEIGHTS.page_view;
          halfLifeDays = 7;
          break;
        case "search":
          weight = SIGNAL_WEIGHTS.search_query;
          halfLifeDays = 14;
          break;
        case "booking_click":
          weight = SIGNAL_WEIGHTS.booking_click;
          halfLifeDays = 30;
          break;
      }
      if (weight > 0) {
        const decay = Math.pow(0.5, ageDays / halfLifeDays);
        addScore(
          scores,
          event.entity_type || "city",
          event.entity_id,
          weight * decay,
          event.event_type,
          event.metadata as Record<string, unknown>,
        );
      }
    }

    // ---------- equality_floor HARD filter ----------
    // When the user has an explicit min_equality_score, drop cities below it.
    if (minEqualityFloor > 0) {
      await applyEqualityFloor(supabase, scores, minEqualityFloor);
    }

    // ---------- materialize ----------
    const recommendations = Array.from(scores.entries())
      .map(([key, entry]) => {
        const [entityType, entityId] = key.split(":");
        return {
          entity_type: entityType,
          entity_id: entityId,
          score: Math.round(entry.score * 100) / 100,
          reason: entry.reasons[0] || "trending",
          reasons: entry.reasons,
          metadata: entry.metadata,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // ---------- cache write ----------
    const ttlMinutes = userId ? SIGNED_IN_TTL_MIN : ANON_TTL_MIN;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    for (const rec of recommendations) {
      await supabase.from("user_recommendations").upsert(
        {
          user_id: userId || null,
          session_id: userId ? null : sessionId,
          rec_type: recType,
          entity_type: rec.entity_type,
          entity_id: rec.entity_id,
          score: rec.score,
          reason: rec.reason,
          metadata: { ...rec.metadata, reasons: rec.reasons },
          signals_version: SIGNALS_VERSION,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,rec_type,entity_type,entity_id" },
      );
    }

    return jsonResponse(
      { recommendations, cached: false, signals_version: SIGNALS_VERSION },
      200,
      req,
    );
  } catch (error) {
    console.error("Recommendation engine error:", error);
    return errorResponse("Internal server error", 500, req);
  }
});

// ---------- helpers ----------

function addScore(
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
  entityType: string,
  entityId: string,
  weight: number,
  reason: string,
  metadata: Record<string, unknown>,
) {
  if (weight <= 0) return;
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

function recencyDecay(timestamp: string | null | undefined, halfLifeDays: number): number {
  if (!timestamp) return 1;
  const ageDays = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

async function applyPrideProximitySignal(
  supabase: SupabaseClient,
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
) {
  const horizon = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data: prideEvents } = await supabase
    .from("events")
    .select("city_id, title, start_date, event_type")
    .gte("start_date", new Date().toISOString())
    .lte("start_date", horizon)
    .or("event_type.ilike.%pride%,title.ilike.%pride%")
    .not("city_id", "is", null)
    .limit(200);

  const seen = new Set<string>();
  for (const ev of prideEvents || []) {
    if (!ev.city_id || seen.has(ev.city_id)) continue;
    seen.add(ev.city_id);
    addScore(
      scores,
      "city",
      ev.city_id,
      SIGNAL_WEIGHTS.pride_proximity,
      "pride_proximity",
      { pride_event: ev.title, pride_date: ev.start_date },
    );
  }
}

async function applySocialGraphSignal(
  supabase: SupabaseClient,
  userId: string,
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
) {
  const { data: follows } = await supabase
    .from("user_follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .limit(200);

  const followeeIds = (follows || []).map((f) => f.followee_id).filter(Boolean);
  if (followeeIds.length === 0) return;

  const { data: friendFavs } = await supabase
    .from("city_favorites")
    .select("city_id, cities(name)")
    .in("user_id", followeeIds)
    .limit(200);

  const tally = new Map<string, { count: number; name?: string }>();
  for (const fav of friendFavs || []) {
    if (!fav.city_id) continue;
    const cur = tally.get(fav.city_id) || { count: 0 };
    cur.count += 1;
    const name = (fav.cities as Record<string, unknown> | null)?.name;
    if (typeof name === "string") cur.name = name;
    tally.set(fav.city_id, cur);
  }

  for (const [cityId, { count, name }] of tally) {
    // friends_count multiplier saturates at 5
    const mult = Math.min(5, count);
    addScore(
      scores,
      "city",
      cityId,
      SIGNAL_WEIGHTS.social_graph * mult,
      "social_graph",
      { name, friends_favorited: count },
    );
  }
}

async function applySeasonalitySignal(
  supabase: SupabaseClient,
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
) {
  const month = new Date().getUTCMonth() + 1;
  const warmThreshold = 22;
  const { data: warm, error } = await supabase
    .from("city_climate_monthly")
    .select("city_id, avg_high_c")
    .eq("month", month)
    .gte("avg_high_c", warmThreshold)
    .limit(100);
  if (error) return; // table not present yet — silent skip
  for (const row of warm || []) {
    addScore(
      scores,
      "city",
      row.city_id,
      SIGNAL_WEIGHTS.seasonality_match,
      "in_season",
      { avg_high_c: row.avg_high_c, month },
    );
  }
}

async function deprioritizeByEqualityScore(
  supabase: SupabaseClient,
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
  threshold: number,
) {
  const ids = Array.from(scores.keys())
    .filter((k) => k.startsWith("city:"))
    .map((k) => k.slice("city:".length));
  if (ids.length === 0) return;
  const { data: rows } = await supabase
    .from("cities")
    .select("id, countries(equality_score)")
    .in("id", ids);
  for (const row of rows || []) {
    const eqScore = (row.countries as Record<string, unknown> | null)?.equality_score as
      | number
      | undefined;
    if (eqScore != null && eqScore < threshold) {
      const entry = scores.get(`city:${row.id}`);
      if (entry) {
        entry.score *= 0.3;
        entry.reasons.push("below_safety_threshold");
      }
    }
  }
}

async function applyEqualityFloor(
  supabase: SupabaseClient,
  scores: Map<string, { score: number; reasons: string[]; metadata: Record<string, unknown> }>,
  floor: number,
) {
  const ids = Array.from(scores.keys())
    .filter((k) => k.startsWith("city:"))
    .map((k) => k.slice("city:".length));
  if (ids.length === 0) return;
  const { data: rows } = await supabase
    .from("cities")
    .select("id, countries(equality_score)")
    .in("id", ids);
  for (const row of rows || []) {
    const eqScore = (row.countries as Record<string, unknown> | null)?.equality_score as
      | number
      | undefined;
    if (eqScore != null && eqScore < floor) {
      scores.delete(`city:${row.id}`);
    }
  }
}
