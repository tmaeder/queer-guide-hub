/**
 * get-current-weather — OpenWeather current weather proxy.
 * Stateless API proxy, no DB needed.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse, buildCorsHeaders, getOrigin } from '../cors';

export async function handleCurrentWeather(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, req, env);
  }

  const apiKey = env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return errorResponse('Weather API key not configured', 500, req, env);
  }

  const { lat, lon, cityName } = await req.json<{ lat?: number; lon?: number; cityName?: string }>();

  if (lat == null || lon == null) {
    return errorResponse('Latitude and longitude are required', 400, req, env);
  }

  const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const response = await fetch(weatherUrl);

  if (!response.ok) {
    return errorResponse('Failed to fetch weather data', response.status, req, env);
  }

  const data = await response.json() as any;

  return jsonResponse({
    success: true,
    city: cityName || data.name,
    country: data.sys?.country,
    current: {
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      windSpeed: data.wind?.speed || 0,
      visibility: data.visibility || 0,
      pressure: data.main.pressure,
    },
  }, 200, req, env);
}
