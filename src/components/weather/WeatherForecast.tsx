import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Wind, Gauge, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WeatherDay {
  date: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  pressure: number;
}

interface WeatherForecastProps {
  latitude?: number | null;
  longitude?: number | null;
  cityName?: string;
  className?: string;
}

export const WeatherForecast = ({ latitude, longitude, cityName, className }: WeatherForecastProps) => {
  const [forecast, setForecast] = useState<WeatherDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude && longitude) {
      fetchWeatherForecast();
    }
  }, [latitude, longitude, cityName]);

  const fetchWeatherForecast = async () => {
    if (!latitude || !longitude) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
        body: { lat: latitude, lon: longitude, cityName }
      });

      if (error) throw error;

      if (data.success) {
        setForecast(data.forecast);
      } else {
        setError('Failed to fetch weather data');
      }
    } catch (err) {
      console.error('Weather forecast error:', err);
      setError('Unable to load weather forecast');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (!latitude || !longitude) {
    return null;
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Weather Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading weather data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Weather Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (forecast.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          5-Day Weather Forecast
          {cityName && <Badge variant="secondary">{cityName}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-5">
          {forecast.map((day, index) => (
            <div key={index} className="text-center">
              <div className="font-medium text-sm mb-2">
                {index === 0 ? 'Today' : formatDate(day.date)}
              </div>
              
              <div className="flex justify-center mb-2">
                <img
                  src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                  alt={day.description}
                  className="w-12 h-12"
                />
              </div>
              
              <div className="space-y-1">
                <div className="font-semibold text-lg">{day.temp}°C</div>
                <div className="text-xs text-muted-foreground">
                  {day.tempMin}° / {day.tempMax}°
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {day.description}
                </div>
              </div>
              
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center justify-center gap-1">
                  <Droplets className="h-3 w-3" />
                  {day.humidity}%
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Wind className="h-3 w-3" />
                  {day.windSpeed} m/s
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Gauge className="h-3 w-3" />
                  {day.pressure} hPa
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};