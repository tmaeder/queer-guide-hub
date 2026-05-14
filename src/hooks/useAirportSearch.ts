import { supabase } from '@/integrations/supabase/client';

export interface AirportRow {
  iata_code: string;
  name: string;
  city_name: string | null;
  country_code: string | null;
}

export async function fetchAirportByIata(
  iata: string,
): Promise<Pick<AirportRow, 'iata_code' | 'city_name' | 'country_code'> | null> {
  const { data } = await supabase
    .from('airports')
    .select('iata_code, city_name, country_code')
    .eq('iata_code', iata)
    .limit(1)
    .maybeSingle();
  return (data as Pick<AirportRow, 'iata_code' | 'city_name' | 'country_code'> | null) ?? null;
}

export async function searchAirports(q: string): Promise<AirportRow[]> {
  const { data } = await supabase
    .from('airports')
    .select('iata_code, name, city_name, country_code')
    .or(`city_name.ilike.%${q}%,name.ilike.%${q}%,iata_code.ilike.%${q}%`)
    .limit(30);
  return (data ?? []) as AirportRow[];
}
