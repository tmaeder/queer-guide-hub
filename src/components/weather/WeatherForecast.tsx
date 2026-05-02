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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!latitude || !longitude) return null;

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Cloud style={{ height: 20, width: 20 }} />
              Weather Forecast
            </div>
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
          <CardTitle>
            <div className="flex items-center gap-2">
              <Cloud style={{ height: 20, width: 20 }} />
              Weather Forecast
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (forecast.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Cloud style={{ height: 20, width: 20 }} />
            5-Day Weather Forecast
            {cityName && <Badge variant="secondary">{cityName}</Badge>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {forecast.map((day, index) => (
            <div key={index} className="text-center">
              <p className="font-medium text-sm mb-2">
                {index === 0 ? 'Today' : formatDate(day.date)}
              </p>

              <div className="flex justify-center mb-2">
                <img
                  src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                  alt={day.description}
                  style={{ width: 48, height: 48 }}
                />
              </div>

              <div className="flex flex-col gap-1">
                <p className="font-semibold text-lg">{day.temp}°C</p>
                <p className="text-xs text-muted-foreground">
                  {day.tempMin}° / {day.tempMax}°
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {day.description}
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-center gap-1">
                  <Droplets style={{ height: 12, width: 12 }} />
                  {day.humidity}%
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Wind style={{ height: 12, width: 12 }} />
                  {day.windSpeed} m/s
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Gauge style={{ height: 12, width: 12 }} />
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
