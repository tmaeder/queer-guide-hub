import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RestCountry {
  name: {
    common: string;
    official: string;
    nativeName?: Record<string, { official: string; common: string }>;
  };
  tld?: string[];
  cca2: string;
  ccn3?: string;
  cca3: string;
  cioc?: string;
  independent?: boolean;
  status: string;
  unMember: boolean;
  currencies?: Record<string, { name: string; symbol?: string }>;
  idd?: {
    root?: string;
    suffixes?: string[];
  };
  capital?: string[];
  altSpellings: string[];
  region: string;
  subregion?: string;
  languages?: Record<string, string>;
  translations: Record<string, { official: string; common: string }>;
  latlng: [number, number];
  landlocked: boolean;
  borders?: string[];
  area: number;
  demonyms?: Record<string, { f: string; m: string }>;
  flag: string;
  maps: {
    googleMaps: string;
    openStreetMaps: string;
  };
  population: number;
  gini?: Record<string, number>;
  fifa?: string;
  car: {
    signs?: string[];
    side: string;
  };
  timezones: string[];
  continents: string[];
  flags: {
    png: string;
    svg: string;
    alt?: string;
  };
  coatOfArms: {
    png?: string;
    svg?: string;
  };
  startOfWeek: string;
  capitalInfo?: {
    latlng?: [number, number];
  };
  postalCode?: {
    format: string;
    regex?: string;
  };
}

async function initializeSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function fetchRestCountriesData(): Promise<RestCountry[]> {
  console.log('Fetching data from REST Countries API...');
  
  const response = await fetch('https://restcountries.com/v3.1/all', {
    headers: {
      'User-Agent': 'Queer-Guide-App/1.0',
      'Accept': 'application/json'
    }
  });
  
  console.log('REST Countries API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`REST Countries API error: ${response.status} - ${errorText}`);
  }

  const countries = await response.json();
  console.log(`Successfully fetched ${countries.length} countries from REST Countries API`);
  
  return countries;
}

async function ensureContinents(supabase: any, countries: RestCountry[]): Promise<Map<string, string>> {
  console.log('Processing continents...');
  
  const continentMap = new Map<string, string>();
  const { data: existingContinents } = await supabase
    .from('continents')
    .select('id, name');

  existingContinents?.forEach((continent: any) => {
    continentMap.set(continent.name, continent.id);
  });

  const uniqueContinents = [...new Set(countries.flatMap(country => country.continents))];
  
  for (const continentName of uniqueContinents) {
    if (!continentMap.has(continentName)) {
      console.log(`Creating continent: ${continentName}`);
      
      const { data: newContinent } = await supabase
        .from('continents')
        .insert({
          name: continentName,
          code: continentName.substring(0, 2).toUpperCase()
        })
        .select('id')
        .single();
      
      if (newContinent) {
        continentMap.set(continentName, newContinent.id);
      }
    }
  }
  
  console.log(`Processed ${continentMap.size} continents`);
  return continentMap;
}

async function getExistingCountries(supabase: any): Promise<Map<string, any>> {
  console.log('Fetching existing countries to preserve LGBTI data...');
  
  const { data: existingCountries } = await supabase
    .from('countries')
    .select('*');

  const existingCountriesMap = new Map();
  existingCountries?.forEach((country: any) => {
    existingCountriesMap.set(country.code, country);
  });
  
  console.log(`Found ${existingCountriesMap.size} existing countries`);
  return existingCountriesMap;
}

function processCountriesData(
  countries: RestCountry[], 
  continentMap: Map<string, string>, 
  existingCountriesMap: Map<string, any>
) {
  console.log('Processing countries data...');
  
  return countries.map(country => {
    const existingCountry = existingCountriesMap.get(country.cca2);
    const primaryCurrency = country.currencies ? Object.values(country.currencies)[0] : null;
    const callingCode = country.idd?.root && country.idd?.suffixes ? 
      `${country.idd.root}${country.idd.suffixes[0]}` : null;

    return {
      id: existingCountry?.id || crypto.randomUUID(),
      name: country.name.common,
      code: country.cca2,
      continent_id: continentMap.get(country.continents[0]) || null,
      capital: country.capital?.[0] || null,
      currency: primaryCurrency?.name || null,
      languages: country.languages ? Object.values(country.languages) : null,
      population: country.population,
      area_km2: country.area,
      latitude: country.latlng[0],
      longitude: country.latlng[1],
      timezone: country.timezones[0] || null,
      calling_code: callingCode,
      internet_tld: country.tld?.[0] || null,
      driving_side: country.car.side,
      flag_emoji: country.flag,
      government_type: null,
      national_anthem: null,
      national_day: null,
      gdp_usd: null,
      gdp_per_capita_usd: null,
      human_development_index: null,
      life_expectancy: null,
      literacy_rate: null,
      major_religions: null,
      climate_zones: null,
      natural_resources: null,
      major_industries: null,
      exports: null,
      imports: null,
      unesco_sites: null,
      national_symbols: null,
      major_airports: null,
      airport_codes: null,
      visa_requirements: null,
      capital_coordinates: country.capitalInfo?.latlng ? {
        lat: country.capitalInfo.latlng[0],
        lng: country.capitalInfo.latlng[1]
      } : null,
      description: null,
      // Preserve existing LGBTI data
      lgbti_criminalization: existingCountry?.lgbti_criminalization || {},
      lgbti_constitutional_protection: existingCountry?.lgbti_constitutional_protection || {},
      lgbti_goods_services_protection: existingCountry?.lgbti_goods_services_protection || {},
      lgbti_health_protection: existingCountry?.lgbti_health_protection || {},
      lgbti_education_protection: existingCountry?.lgbti_education_protection || {},
      lgbti_bullying_protection: existingCountry?.lgbti_bullying_protection || {},
      lgbti_employment_protection: existingCountry?.lgbti_employment_protection || {},
      lgbti_housing_protection: existingCountry?.lgbti_housing_protection || {},
      lgbti_hate_crime_law: existingCountry?.lgbti_hate_crime_law || {},
      lgbti_incitement_prohibition: existingCountry?.lgbti_incitement_prohibition || {},
      lgbti_association_restrictions: existingCountry?.lgbti_association_restrictions || {},
      lgbti_expression_restrictions: existingCountry?.lgbti_expression_restrictions || {},
      lgbti_same_sex_unions: existingCountry?.lgbti_same_sex_unions || null,
      lgbti_adoption_rights: existingCountry?.lgbti_adoption_rights || null,
      lgbti_gender_recognition: existingCountry?.lgbti_gender_recognition || {},
      lgbti_intersex_protection: existingCountry?.lgbti_intersex_protection || null,
      lgbti_conversion_therapy_regulation: existingCountry?.lgbti_conversion_therapy_regulation || null,
      lgbt_rights_status: existingCountry?.lgbt_rights_status || null,
      lgbt_legal_status: existingCountry?.lgbt_legal_status || null,
      lgbti_data_last_updated: existingCountry?.lgbti_data_last_updated || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
}

function processCapitalCities(countries: RestCountry[], processedCountries: any[]) {
  console.log('Processing capital cities...');
  
  const capitalCities = countries
    .filter(country => country.capital && country.capital.length > 0)
    .map(country => {
      const countryData = processedCountries.find(c => c.code === country.cca2);
      if (!countryData) return null;

      return {
        id: crypto.randomUUID(),
        name: country.capital![0],
        country_id: countryData.id,
        is_capital: true,
        latitude: country.capitalInfo?.latlng?.[0] || country.latlng[0],
        longitude: country.capitalInfo?.latlng?.[1] || country.latlng[1],
        timezone: country.timezones[0] || null,
        description: `Capital city of ${country.name.common}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    })
    .filter(city => city !== null);
    
  console.log(`Processed ${capitalCities.length} capital cities`);
  return capitalCities;
}

async function insertDataInBatches(supabase: any, tableName: string, data: any[], batchSize = 50) {
  console.log(`Inserting ${data.length} records into ${tableName} in batches of ${batchSize}...`);
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .insert(batch);

    if (error) {
      console.error(`Error inserting ${tableName} batch ${i}-${i + batchSize}:`, error);
      throw error;
    }
    
    console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)} for ${tableName}`);
  }
  
  console.log(`Successfully inserted all ${data.length} records into ${tableName}`);
}

async function clearExistingData(supabase: any) {
  console.log('Clearing existing data...');
  
  // Delete existing cities first (foreign key constraint)
  console.log('Deleting existing cities...');
  await supabase.from('cities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log('Deleting existing countries...');
  await supabase.from('countries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log('Data cleared successfully');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting country data import...');
    
    // Initialize Supabase client
    const supabase = await initializeSupabaseClient();
    console.log('Supabase client initialized');

    // Fetch data from REST Countries API
    const restCountries = await fetchRestCountriesData();

    // Process continents
    const continentMap = await ensureContinents(supabase, restCountries);

    // Get existing countries to preserve LGBTI data
    const existingCountriesMap = await getExistingCountries(supabase);

    // Process countries data
    const processedCountries = processCountriesData(restCountries, continentMap, existingCountriesMap);

    // Process capital cities
    const capitalCities = processCapitalCities(restCountries, processedCountries);

    // Clear existing data
    await clearExistingData(supabase);

    // Insert new data
    await insertDataInBatches(supabase, 'countries', processedCountries);
    await insertDataInBatches(supabase, 'cities', capitalCities);

    console.log('Country data import completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully imported ${processedCountries.length} countries and ${capitalCities.length} capital cities`,
        countriesCount: processedCountries.length,
        citiesCount: capitalCities.length,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in country data import:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to import country data',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});