import { useQuery } from '@tanstack/react-query';

interface Airline {
  iata: string;
  name: string;
  isLowCost: boolean;
}

const AIRLINE_DATA_URL = 'https://api.travelpayouts.com/data/en/airlines.json';

/**
 * Fetches airline reference data from Travelpayouts.
 * Cached for 24h — this data rarely changes.
 */
export function useAirlineData() {
  const { data: airlines } = useQuery({
    queryKey: ['airline-data'],
    queryFn: async (): Promise<Map<string, Airline>> => {
      const res = await fetch(AIRLINE_DATA_URL);
      if (!res.ok) return new Map();
      const data = await res.json();
      const map = new Map<string, Airline>();
      for (const airline of data) {
        if (airline.iata) {
          map.set(airline.iata, {
            iata: airline.iata,
            name: airline.name || airline.name_translations?.en || airline.iata,
            isLowCost: airline.is_lowcost || false,
          });
        }
      }
      return map;
    },
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
  });

  const getAirline = (iata: string | null | undefined): Airline | undefined => {
    if (!iata || !airlines) return undefined;
    return airlines.get(iata.toUpperCase());
  };

  const getAirlineLogo = (iata: string | null | undefined, size: 32 | 64 | 128 = 64): string | undefined => {
    if (!iata) return undefined;
    return `https://pics.avs.io/${size}/${size}/${iata.toUpperCase()}.png`;
  };

  return { airlines, getAirline, getAirlineLogo };
}
