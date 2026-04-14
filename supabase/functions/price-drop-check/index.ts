import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase-client.ts";
import { sendEmail, isEmailConfigured } from "../_shared/email.ts";

/**
 * Price Drop Check (Cron Job)
 *
 * Runs periodically to check for price drops on routes from
 * users' favorited cities. Notifies via email when a significant
 * drop is detected.
 *
 * Schedule: daily at 06:00 UTC via Supabase cron or external trigger.
 */

const TRAVELPAYOUTS_BASE = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const PRICE_DROP_THRESHOLD = 0.15; // 15% drop triggers alert

serve(async (req) => {
  try {
    const supabase = getServiceClient();
    const apiToken = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!apiToken) return errorResponse('API token missing', 500);

    // Get users with favorited cities that have airports
    const { data: cityFavs } = await supabase
      .from('city_favorites')
      .select('user_id, city_id, cities(name, major_airport_code)')
      .not('cities.major_airport_code', 'is', null)
      .limit(100);

    if (!cityFavs || cityFavs.length === 0) {
      return jsonResponse({ success: true, checked: 0, alerts: 0 });
    }

    // Group by user
    const userCities = new Map<string, { cityId: string; cityName: string; iata: string }[]>();
    for (const fav of cityFavs) {
      const city = fav.cities as { name: string; major_airport_code: string } | null;
      if (!city?.major_airport_code) continue;
      if (!userCities.has(fav.user_id)) userCities.set(fav.user_id, []);
      userCities.get(fav.user_id)!.push({
        cityId: fav.city_id,
        cityName: city.name,
        iata: city.major_airport_code,
      });
    }

    let alertsSent = 0;

    for (const [userId, cities] of userCities) {
      // Get user's origin airport from their last detected location
      const { data: lastEvent } = await supabase
        .from('user_events')
        .select('metadata')
        .eq('user_id', userId)
        .eq('event_type', 'page_view')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Check cached prices vs current for each favorited city
      for (const city of cities.slice(0, 5)) {
        const cacheKey = `price_cache:${city.iata}`;

        // Get cached price
        const { data: cached } = await supabase
          .from('user_events')
          .select('metadata')
          .eq('user_id', userId)
          .eq('event_type', 'price_cache')
          .eq('entity_id', city.iata)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const previousPrice = (cached?.metadata as Record<string, unknown>)?.price as number | undefined;

        // Fetch current price
        const url = new URL(TRAVELPAYOUTS_BASE);
        url.searchParams.set('destination', city.iata);
        url.searchParams.set('currency', 'eur');
        url.searchParams.set('sorting', 'price');
        url.searchParams.set('limit', '1');
        url.searchParams.set('token', apiToken);

        try {
          const res = await fetch(url.toString());
          if (!res.ok) continue;
          const data = await res.json();
          const currentPrice = data.data?.[0]?.price as number | undefined;
          if (!currentPrice) continue;

          // Store current price as cache
          await supabase.from('user_events').insert({
            user_id: userId,
            event_type: 'price_cache',
            entity_type: 'flight',
            entity_id: city.iata,
            metadata: { price: currentPrice, currency: 'EUR', checked_at: new Date().toISOString() },
          });

          // Check for price drop
          if (previousPrice && currentPrice < previousPrice * (1 - PRICE_DROP_THRESHOLD)) {
            const dropPct = Math.round((1 - currentPrice / previousPrice) * 100);

            if (isEmailConfigured()) {
              const { data: userData } = await supabase.auth.admin.getUserById(userId);
              const email = userData?.user?.email;
              if (email) {
                await sendEmail({
                  from: 'Queer Guide <alerts@queer.guide>',
                  to: [email],
                  subject: `Price drop: flights to ${city.cityName} down ${dropPct}%`,
                  html: `
<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px;">Price Drop Alert</h2>
  <p>Flights to <strong>${city.cityName}</strong> dropped <strong>${dropPct}%</strong></p>
  <p style="font-size:24px;font-weight:800;color:#b60d3d;">€${currentPrice} <span style="font-size:14px;color:#999;text-decoration:line-through;">€${previousPrice}</span></p>
  <a href="https://queer.guide/travel?to=${city.iata}" style="display:inline-block;padding:10px 20px;background:#b60d3d;color:#fff;text-decoration:none;font-weight:600;">View Deals</a>
  <p style="color:#999;font-size:11px;margin-top:16px;">queer.guide price alerts</p>
</div>`,
                  text: `Flights to ${city.cityName} dropped ${dropPct}%: €${currentPrice} (was €${previousPrice}). View at https://queer.guide/travel?to=${city.iata}`,
                });
                alertsSent++;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }

    return jsonResponse({ success: true, checked: userCities.size, alerts: alertsSent });
  } catch (error) {
    console.error('Price drop check error:', error);
    return errorResponse('Internal server error', 500);
  }
});
