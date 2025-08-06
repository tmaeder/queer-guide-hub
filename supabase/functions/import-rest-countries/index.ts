import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting REST Countries import function...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('Supabase client initialized');

    console.log('Starting REST Countries import...');

    // Fetch countries from REST Countries API with better error handling
    console.log('Fetching data from REST Countries API...');
    
    const restCountriesResponse = await fetch('https://restcountries.com/v3.1/all', {
      headers: {
        'User-Agent': 'Queer-Guide-App/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('REST Countries API response status:', restCountriesResponse.status);
    
    if (!restCountriesResponse.ok) {
      const errorText = await restCountriesResponse.text();
      console.error(`REST Countries API error: ${restCountriesResponse.status} - ${errorText}`);
      throw new Error(`REST Countries API error: ${restCountriesResponse.status} - ${errorText}`);
    }

    const restCountries: RestCountry[] = await restCountriesResponse.json();
    console.log(`Successfully fetched ${restCountries.length} countries from REST Countries API`);

    // Get or create continent mappings
    const continentMap = new Map<string, string>();
    const { data: existingContinents } = await supabase
      .from('continents')
      .select('id, name');

    existingContinents?.forEach(continent => {
      continentMap.set(continent.name, continent.id);
    });

    // Create missing continents
    const uniqueContinents = [...new Set(restCountries.flatMap(country => country.continents))];
    for (const continentName of uniqueContinents) {
      if (!continentMap.has(continentName)) {
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

    // Get existing countries to preserve LGBTI data
    const { data: existingCountries } = await supabase
      .from('countries')
      .select('*');

    const existingCountriesMap = new Map();
    existingCountries?.forEach(country => {
      existingCountriesMap.set(country.code, country);
    });

    // Process countries
    const processedCountries = restCountries.map(country => {
      const existingCountry = existingCountriesMap.get(country.cca2);
      const primaryCurrency = country.currencies ? Object.values(country.currencies)[0] : null;
      const primaryLanguage = country.languages ? Object.values(country.languages)[0] : null;
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
        government_type: null, // Not available in REST Countries
        national_anthem: null, // Not available in REST Countries
        national_day: null, // Not available in REST Countries
        gdp_usd: null, // Not available in REST Countries
        gdp_per_capita_usd: null, // Not available in REST Countries
        human_development_index: null, // Not available in REST Countries
        life_expectancy: null, // Not available in REST Countries
        literacy_rate: null, // Not available in REST Countries
        major_religions: null, // Not available in REST Countries
        climate_zones: null, // Not available in REST Countries
        natural_resources: null, // Not available in REST Countries
        major_industries: null, // Not available in REST Countries
        exports: null, // Not available in REST Countries
        imports: null, // Not available in REST Countries
        unesco_sites: null, // Not available in REST Countries
        national_symbols: null, // Not available in REST Countries
        major_airports: null, // Not available in REST Countries
        airport_codes: null, // Not available in REST Countries
        visa_requirements: null, // Not available in REST Countries
        capital_coordinates: country.capitalInfo?.latlng ? {
          lat: country.capitalInfo.latlng[0],
          lng: country.capitalInfo.latlng[1]
        } : null,
        description: null, // To be filled manually
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

    // Delete existing countries and cities
    console.log('Deleting existing cities...');
    await supabase.from('cities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('Deleting existing countries...');
    await supabase.from('countries').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert countries in batches
    const batchSize = 50;
    for (let i = 0; i < processedCountries.length; i += batchSize) {
      const batch = processedCountries.slice(i, i + batchSize);
      const { error: countryError } = await supabase
        .from('countries')
        .insert(batch);

      if (countryError) {
        console.error(`Error inserting countries batch ${i}-${i + batchSize}:`, countryError);
        throw countryError;
      }
    }

    console.log(`Inserted ${processedCountries.length} countries`);

    // Process and insert capital cities
    const capitalCities = restCountries
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

    // Insert capital cities in batches
    for (let i = 0; i < capitalCities.length; i += batchSize) {
      const batch = capitalCities.slice(i, i + batchSize);
      const { error: cityError } = await supabase
        .from('cities')
        .insert(batch);

      if (cityError) {
        console.error(`Error inserting cities batch ${i}-${i + batchSize}:`, cityError);
        throw cityError;
      }
    }

    console.log(`Inserted ${capitalCities.length} capital cities`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully imported ${processedCountries.length} countries and ${capitalCities.length} capital cities`,
        countriesCount: processedCountries.length,
        citiesCount: capitalCities.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error importing REST Countries data:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Return detailed error information
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Failed to import REST Countries data',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});