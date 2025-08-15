import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// List of countries to import data for
const COUNTRIES_TO_IMPORT = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
  'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada',
  'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark',
  'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal',
  'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Palau', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { batchSize = 10, startIndex = 0 } = await req.json().catch(() => ({}));

    console.log(`Starting ILGA data import from index ${startIndex}, batch size ${batchSize}`);

    const results = [];
    const errors = [];
    
    // Process countries in batches to avoid overwhelming the ILGA server
    const endIndex = Math.min(startIndex + batchSize, COUNTRIES_TO_IMPORT.length);
    const batch = COUNTRIES_TO_IMPORT.slice(startIndex, endIndex);

    for (const countryName of batch) {
      try {
        console.log(`Importing data for ${countryName}...`);

        // Get country data from database to get country code
        const { data: countryData } = await supabase
          .from('countries')
          .select('code, name')
          .ilike('name', `%${countryName}%`)
          .single();

        if (!countryData) {
          console.log(`Country not found in database: ${countryName}`);
          continue;
        }

        // Call the fetch-ilga-data function to get real data
        const { data: ilgaResponse, error: ilgaError } = await supabase.functions.invoke('fetch-ilga-data', {
          body: {
            countryCode: countryData.code,
            countryName: countryData.name,
            forceUpdate: true
          }
        });

        if (ilgaError) {
          console.error(`Error fetching ILGA data for ${countryName}:`, ilgaError);
          errors.push({ country: countryName, error: ilgaError.message });
          continue;
        }

        if (!ilgaResponse?.success) {
          console.error(`Failed to fetch ILGA data for ${countryName}:`, ilgaResponse?.error);
          errors.push({ country: countryName, error: ilgaResponse?.error || 'Unknown error' });
          continue;
        }

        const jurisdictionData = ilgaResponse.data;

        // Update the country record with LGBTI data
        const { error: updateError } = await supabase
          .from('countries')
          .update({
            lgbti_criminalization: jurisdictionData.criminalisation,
            lgbti_same_sex_unions: jurisdictionData.sameSeMarriage,
            lgbti_employment_protection: {
              status: jurisdictionData.antidiscrimination.scope.includes('employment') ? 'Protected' : 'None',
              description: jurisdictionData.antidiscrimination.description
            },
            lgbti_housing_protection: {
              status: jurisdictionData.antidiscrimination.scope.includes('housing') ? 'Protected' : 'None',
              description: jurisdictionData.antidiscrimination.description
            },
            lgbti_education_protection: {
              status: jurisdictionData.antidiscrimination.scope.includes('education') ? 'Protected' : 'None',
              description: jurisdictionData.antidiscrimination.description
            },
            lgbti_health_protection: {
              status: jurisdictionData.antidiscrimination.scope.includes('healthcare') ? 'Protected' : 'None',
              description: jurisdictionData.antidiscrimination.description
            },
            lgbti_goods_services_protection: {
              status: jurisdictionData.antidiscrimination.scope.includes('public services') ? 'Protected' : 'None',
              description: jurisdictionData.antidiscrimination.description
            },
            lgbti_constitutional_protection: {
              status: jurisdictionData.constitutionalProtection ? 'Protected' : 'None',
              description: 'Constitutional protection status'
            },
            lgbti_hate_crime_law: {
              status: jurisdictionData.hateClimeLaws ? 'Protected' : 'None',
              description: 'Hate crime legislation status'
            },
            lgbti_data_last_updated: new Date().toISOString()
          })
          .eq('code', countryData.code);

        if (updateError) {
          console.error(`Error updating country ${countryName}:`, updateError);
          errors.push({ country: countryName, error: updateError.message });
        } else {
          console.log(`Successfully updated ${countryName}`);
          results.push({ country: countryName, status: 'success' });
        }

        // Add delay between requests to be respectful to ILGA server
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing ${countryName}:`, error);
        errors.push({ country: countryName, error: error.message });
      }
    }

    const response = {
      success: true,
      processed: results.length,
      errors: errors.length,
      results,
      errors,
      nextBatchIndex: endIndex < COUNTRIES_TO_IMPORT.length ? endIndex : null,
      totalCountries: COUNTRIES_TO_IMPORT.length
    };

    console.log('Import batch completed:', response);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ILGA import:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});