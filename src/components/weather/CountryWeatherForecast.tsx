import { useState, useEffect } from "react";
import { Cloud, Sun, CloudRain, Thermometer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WeatherData {
  success: boolean;
  city?: string;
  country?: string;
  forecast: Array<{
    date: string;
    temp: number;
    tempMin: number;
    tempMax: number;
    description: string;
    icon: string;
    humidity: number;
    windSpeed: number;
    pressure: number;
  }>;
}

interface CountryWeatherForecastProps {
  latitude: number;
  longitude: number;
  countryName: string;
  capital?: string;
}

export default function CountryWeatherForecast({
  latitude,
  longitude,
  countryName,
  capital
}: CountryWeatherForecastProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchWeather defined below, re-run on lat/lng change
  }, [latitude, longitude]);

  const fetchWeather = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
        body: {
          lat: latitude,
          lon: longitude,
          cityName: capital || countryName
        }
      });

      if (error) {
        console.error('Weather fetch error:', error);
        setError('Unable to load weather data');
        return;
      }

      if (data?.success) {
        setWeather(data);
      } else {
        setError(data?.error || 'Failed to fetch weather');
      }
    } catch (err) {
      console.error('Weather error:', err);
      setError('Weather service unavailable');
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (iconCode: string) => {
    if (iconCode.includes('01')) return <Sun style={{ height: 16, width: 16 }} />;
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) return <Cloud style={{ height: 16, width: 16 }} />;
    if (iconCode.includes('09') || iconCode.includes('10') || iconCode.includes('11')) return <CloudRain style={{ height: 16, width: 16 }} />;
    return <Cloud style={{ height: 16, width: 16 }} />;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Thermometer style={{ height: 16, width: 16 }} />
        Loading weather...
      </div>
    );
  }

  if (error || !weather?.forecast?.length) {
    return null; // Hide if no weather data available
  }

  // Get the first 3 days of forecast
  const threeDayForecast = weather.forecast.slice(0, 3);

  return (
    <div className="flex items-center gap-4 text-sm">
      {threeDayForecast.map((day, index) => (
        <div key={day.date} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {index === 0 ? 'Today' :
             index === 1 ? 'Tom' :
             new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
          </span>
          {getWeatherIcon(day.icon)}
          <span className="text-sm font-medium">{day.temp}°</span>
        </div>
      ))}
    </div>
  );
}
