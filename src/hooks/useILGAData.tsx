import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LGBTJurisdiction {
  country: string;
  countryCode: string;
  criminalisation: {
    status: string;
    description: string;
    penalty: string;
    enforcement: string;
  };
  sameSeMarriage: {
    status: string;
    description: string;
    date?: string;
  };
  antidiscrimination: {
    status: string;
    description: string;
    scope: string[];
  };
  constitutionalProtection: boolean;
  hateClimeLaws: boolean;
  lastUpdated: string;
  sources: string[];
}

export const useILGAData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchILGAData = useCallback(async (countryCode?: string, countryName?: string, forceUpdate?: boolean): Promise<LGBTJurisdiction | null> => {
    if (!countryCode && !countryName) {
      setError('Country code or name required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Fetching ILGA data for:', { countryCode, countryName, forceUpdate });
      
      const { data, error: functionError } = await supabase.functions.invoke('fetch-ilga-data', {
        body: {
          countryCode,
          countryName,
          forceUpdate
        }
      });

      if (functionError) {
        console.error('Function error:', functionError);
        throw new Error(functionError.message || 'Failed to fetch ILGA data');
      }

      if (!data?.success) {
        console.error('Function returned error:', data?.error);
        throw new Error(data?.error || 'Failed to fetch ILGA data');
      }

      console.log('Successfully fetched ILGA data:', data.data);
      return data.data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error fetching ILGA data:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const importAllILGAData = useCallback(async (batchSize: number = 10, startIndex: number = 0) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Starting ILGA data import batch:', { batchSize, startIndex });
      
      const { data, error: functionError } = await supabase.functions.invoke('import-ilga-data', {
        body: {
          batchSize,
          startIndex
        }
      });

      if (functionError) {
        console.error('Import function error:', functionError);
        throw new Error(functionError.message || 'Failed to import ILGA data');
      }

      console.log('Import batch completed:', data);
      return data;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error importing ILGA data:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fetchILGAData,
    importAllILGAData,
    loading,
    error
  };
};