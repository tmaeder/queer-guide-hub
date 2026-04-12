import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Wind, Gauge, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchWeatherForecast defined below, re-run on lat/lng/city change
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
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Cloud style={{ height: 20, width: 20 }} />
              Weather Forecast
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <Loader2 style={{ height: 24, width: 24, animation: 'spin 1s linear infinite' }} />
            <Typography component="span" sx={{ ml: 1 }}>Loading weather data...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Cloud style={{ height: 20, width: 20 }} />
              Weather Forecast
            </Box>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>{error}</Typography>
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
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Cloud style={{ height: 20, width: 20 }} />
            5-Day Weather Forecast
            {cityName && <Badge variant="secondary">{cityName}</Badge>}
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' } }}>
          {forecast.map((day, index) => (
            <Box key={index} sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.875rem', mb: 1 }}>
                {index === 0 ? 'Today' : formatDate(day.date)}
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                <img
                  src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                  alt={day.description}
                  style={{ width: 48, height: 48 }}
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '1.125rem' }}>{day.temp}°C</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {day.tempMin}° / {day.tempMax}°
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                  {day.description}
                </Typography>
              </Box>

              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Droplets style={{ height: 12, width: 12 }} />
                  {day.humidity}%
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Wind style={{ height: 12, width: 12 }} />
                  {day.windSpeed} m/s
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Gauge style={{ height: 12, width: 12 }} />
                  {day.pressure} hPa
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};
