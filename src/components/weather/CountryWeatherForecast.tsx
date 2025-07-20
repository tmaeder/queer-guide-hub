import { useState, useEffect } from "react";
import { Cloud, Sun, CloudRain, Thermometer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    if (iconCode.includes('01')) return <Sun className="h-4 w-4" />;
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) return <Cloud className="h-4 w-4" />;
    if (iconCode.includes('09') || iconCode.includes('10') || iconCode.includes('11')) return <CloudRain className="h-4 w-4" />;
    return <Cloud className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Thermometer className="h-4 w-4" />
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
          <div className="text-xs text-muted-foreground">
            {index === 0 ? 'Today' : 
             index === 1 ? 'Tom' : 
             new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
          </div>
          {getWeatherIcon(day.icon)}
          <span className="font-medium">{day.temp}°</span>
        </div>
      ))}
    </div>
  );
}