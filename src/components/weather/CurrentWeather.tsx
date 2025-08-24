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
        return <Sun className="h-8 w-8 text-yellow-500" />;
      case '02':
      case '03':
      case '04':
        return <Cloud className="h-8 w-8 text-gray-500" />;
      case '09':
      case '10':
        return <CloudRain className="h-8 w-8 text-blue-500" />;
      case '13':
        return <CloudSnow className="h-8 w-8 text-blue-200" />;
      default:
        return <Sun className="h-8 w-8 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-primary" />
            Current Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading weather data...</div>
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
        <CardTitle className="flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-primary" />
          Current Weather
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main weather display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getWeatherIcon(current.icon)}
            <div>
              <div className="text-3xl font-bold">{Math.round(current.temp)}°C</div>
              <div className="text-sm text-muted-foreground capitalize">
                {current.description}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Feels like</div>
            <div className="text-lg font-semibold">{Math.round(current.feels_like)}°C</div>
          </div>
        </div>

        {/* Weather details */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-sm text-muted-foreground">Humidity</div>
              <div className="font-semibold">{current.humidity}%</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4 text-gray-500" />
            <div>
              <div className="text-sm text-muted-foreground">Wind</div>
              <div className="font-semibold">{current.windSpeed} m/s</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-gray-500" />
            <div>
              <div className="text-sm text-muted-foreground">Visibility</div>
              <div className="font-semibold">{(current.visibility / 1000).toFixed(1)} km</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-gray-500" />
            <div>
              <div className="text-sm text-muted-foreground">Pressure</div>
              <div className="font-semibold">{current.pressure} hPa</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}