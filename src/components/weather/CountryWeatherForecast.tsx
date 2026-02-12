import { useState, useEffect } from "react";
import { Cloud, Sun, CloudRain, Thermometer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    if (iconCode.includes('01')) return <Sun style={{ height: 16, width: 16 }} />;
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) return <Cloud style={{ height: 16, width: 16 }} />;
    if (iconCode.includes('09') || iconCode.includes('10') || iconCode.includes('11')) return <CloudRain style={{ height: 16, width: 16 }} />;
    return <Cloud style={{ height: 16, width: 16 }} />;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: 'text.secondary' }}>
        <Thermometer style={{ height: 16, width: 16 }} />
        Loading weather...
      </Box>
    );
  }

  if (error || !weather?.forecast?.length) {
    return null; // Hide if no weather data available
  }

  // Get the first 3 days of forecast
  const threeDayForecast = weather.forecast.slice(0, 3);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.875rem' }}>
      {threeDayForecast.map((day, index) => (
        <Box key={day.date} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {index === 0 ? 'Today' :
             index === 1 ? 'Tom' :
             new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
          </Typography>
          {getWeatherIcon(day.icon)}
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{day.temp}°</Typography>
        </Box>
      ))}
    </Box>
  );
}
