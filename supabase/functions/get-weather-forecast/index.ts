import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { getCorsHeaders } from '../_shared/supabase-client.ts'
import { checkIpRateLimit } from '../_shared/ip-rate-limit.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Public, unauthenticated endpoint proxying the paid OpenWeather key — cap
  // per-IP request volume so scripted abuse can't burn the project's quota.
  if (!(await checkIpRateLimit(req, 'get-weather-forecast', 20, 60))) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { lat, lon, cityName } = await req.json();

    if (lat == null || lon == null) {
      return new Response(
        JSON.stringify({ error: 'Latitude and longitude are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
    if (!apiKey) {
      console.error('OPENWEATHER_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'Weather API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching weather forecast for:', { lat, lon, cityName });

    // Get 5-day weather forecast
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    
    const response = await fetch(forecastUrl);
    
    if (!response.ok) {
      console.error('OpenWeather API error:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch weather data' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Process the forecast data to get daily forecasts (every 8th entry for daily data)
    const dailyForecasts = [];
    for (let i = 0; i < data.list.length; i += 8) {
      const forecast = data.list[i];
      if (dailyForecasts.length < 5) {
        dailyForecasts.push({
          date: forecast.dt_txt.split(' ')[0],
          temp: Math.round(forecast.main.temp),
          tempMin: Math.round(forecast.main.temp_min),
          tempMax: Math.round(forecast.main.temp_max),
          description: forecast.weather[0].description,
          icon: forecast.weather[0].icon,
          humidity: forecast.main.humidity,
          windSpeed: forecast.wind.speed,
          pressure: forecast.main.pressure
        });
      }
    }

    console.log('Processed weather forecast:', dailyForecasts.length, 'days');

    return new Response(
      JSON.stringify({
        success: true,
        city: cityName || data.city?.name,
        country: data.city?.country,
        forecast: dailyForecasts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-weather-forecast function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});