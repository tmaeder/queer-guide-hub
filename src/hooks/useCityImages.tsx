import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';

export const useCityImages = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCityImage = useCallback(async (cityId: string, cityName: string, countryName?: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching image for city:', { cityId, cityName, countryName });
      
      const { data, error: functionError } = await api.functions.invoke('fetch-and-store-city-images', {
        body: {
          cityId,
          cityName,
          countryName
        }
      });

      if (functionError) {
        console.error('Function error:', functionError);
        throw new Error(functionError.message || 'Failed to fetch city image');
      }

      if (!data?.success) {
        console.error('Function returned error:', data?.error);
        throw new Error(data?.error || 'Failed to fetch city image');
      }

      console.log('Successfully fetched city image:', data.image_url);
      return {
        image_url: data.image_url,
        image_metadata: data.image_metadata,
        cached: data.cached
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching city image:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fetchCityImage,
    loading,
    error
  };
};