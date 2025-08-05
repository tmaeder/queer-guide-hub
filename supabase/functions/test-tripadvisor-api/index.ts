import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== TripAdvisor API Test Starting ===');
    
    const tripadvisorApiKey = Deno.env.get('TRIPADVISOR_API_KEY');
    
    console.log('API Key configured:', tripadvisorApiKey ? 'Yes' : 'No');
    console.log('API Key length:', tripadvisorApiKey?.length || 0);
    console.log('API Key first 8 chars:', tripadvisorApiKey?.substring(0, 8) || 'None');
    
    if (!tripadvisorApiKey) {
      throw new Error('TripAdvisor API key not configured');
    }

    // Test 1: Basic API connectivity
    console.log('\n=== Test 1: Basic API Test ===');
    const testUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${tripadvisorApiKey}&searchQuery=New%20York&language=en`;
    console.log('Test URL (masked):', testUrl.replace(/key=[^&]+/, 'key=***'));
    
    const testResponse = await fetch(testUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Queer-Guide-Test/1.0'
      },
    });

    console.log('Response status:', testResponse.status);
    console.log('Response status text:', testResponse.statusText);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(testResponse.headers.entries()), null, 2));

    const responseText = await testResponse.text();
    console.log('Response body length:', responseText.length);
    console.log('Response body:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('Parsed JSON response:', JSON.stringify(responseData, null, 2));
    } catch (jsonError) {
      console.log('Response is not valid JSON:', jsonError.message);
    }

    // Test 2: Different endpoint format
    console.log('\n=== Test 2: Alternative URL Format ===');
    const altUrl = `https://api.content.tripadvisor.com/api/v1/location/search`;
    const altResponse = await fetch(altUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-TripAdvisor-API-Key': tripadvisorApiKey,
        'User-Agent': 'Queer-Guide-Test/1.0'
      },
    });

    console.log('Alternative format status:', altResponse.status);
    const altText = await altResponse.text();
    console.log('Alternative format response:', altText);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'TripAdvisor API tests completed',
        results: {
          test1: {
            status: testResponse.status,
            statusText: testResponse.statusText,
            body: responseText,
            parsedJson: responseData
          },
          test2: {
            status: altResponse.status,
            body: altText
          }
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Test error:', error);
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});