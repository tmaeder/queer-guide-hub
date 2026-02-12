import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Thermometer, Droplets, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CurrentWeatherData {
  success: boolean;
  city?: string;
  country?: string;
  current?: {
    temp: number;
    feels_like: number;
    description: string;
    icon: string;
    humidity: number;
    windSpeed: number;
    visibility: number;
    pressure: number;
  };
  error?: string;
}

interface CurrentWeatherProps {
  latitude?: number;
  longitude?: number;
  cityName?: string;
  className?: string;
}

export function CurrentWeather({ latitude, longitude, cityName, className }: CurrentWeatherProps) {
  const [weather, setWeather] = useState<CurrentWeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude && longitude) {
      fetchCurrentWeather();
    }
  }, [latitude, longitude, cityName]);

  const fetchCurrentWeather = async () => {
    if (!latitude || !longitude) return;

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching current weather for:', { latitude, longitude, cityName });
      
      const { data, error: functionError } = await supabase.functions.invoke('get-current-weather', {
        body: {
          lat: latitude,
          lon: longitude,
          cityName
        }
      });

      if (functionError) {
        console.error('Function error:', functionError);
        throw new Error(functionError.message || 'Failed to fetch current weather');
      }

      if (!data?.success) {
        console.error('Function returned error:', data?.error);
        throw new Error(data?.error || 'Failed to fetch current weather');
      }

      console.log('Current weather data:', data);
      setWeather(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching current weather:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (iconCode: string) => {
    const code = iconCode?.substring(0, 2);
    switch (code) {
      case '01':
        return <Sun style={{ height: 32, width: 32, color: '#eab308' }} />;
      case '02':
      case '03':
      case '04':
        return <Cloud style={{ height: 32, width: 32, color: '#6b7280' }} />;
      case '09':
      case '10':
        return <CloudRain style={{ height: 32, width: 32, color: '#3b82f6' }} />;
      case '13':
        return <CloudSnow style={{ height: 32, width: 32, color: '#bfdbfe' }} />;
      default:
        return <Sun style={{ height: 32, width: 32, color: '#eab308' }} />;
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Thermometer style={{ height: 20, width: 20, color: 'var(--primary)' }} />
            Current Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <div style={{ color: 'var(--muted-foreground)' }}>Loading weather data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather?.current) {
    return null;
  }

  const { current } = weather;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Thermometer style={{ height: 20, width: 20, color: 'var(--primary)' }} />
          Current Weather
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Main weather display */}
        <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {getWeatherIcon(current.icon)}
            <div>
              <div sx={{ fontSize: '1.875rem', fontWeight: 700 }}>{Math.round(current.temp)}°C</div>
              <div sx={{ fontSize: '0.875rem', color: 'text.secondary', textTransform: 'capitalize' }}>
                {current.description}
              </div>
            </div>
          </div>
          <div sx={{ textAlign: 'right' }}>
            <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Feels like</div>
            <div sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{Math.round(current.feels_like)}°C</div>
          </div>
        </div>

        {/* Weather details */}
        <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Droplets style={{ height: 16, width: 16, color: '#3b82f6' }} />
            <div>
              <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Humidity</div>
              <div sx={{ fontWeight: 600 }}>{current.humidity}%</div>
            </div>
          </div>
          
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Wind style={{ height: 16, width: 16, color: '#6b7280' }} />
            <div>
              <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Wind</div>
              <div sx={{ fontWeight: 600 }}>{current.windSpeed} m/s</div>
            </div>
          </div>
          
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Eye style={{ height: 16, width: 16, color: '#6b7280' }} />
            <div>
              <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Visibility</div>
              <div sx={{ fontWeight: 600 }}>{(current.visibility / 1000).toFixed(1)} km</div>
            </div>
          </div>
          
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Thermometer style={{ height: 16, width: 16, color: '#6b7280' }} />
            <div>
              <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Pressure</div>
              <div sx={{ fontWeight: 600 }}>{current.pressure} hPa</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}