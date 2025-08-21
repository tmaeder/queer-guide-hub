import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple decryption for demo purposes - in production use proper encryption
function simpleDecrypt(encrypted: string): string {
  return atob(encrypted); // Base64 decoding - replace with proper decryption
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { service_name, key_name } = await req.json();

    if (!service_name || !key_name) {
      return new Response(
        JSON.stringify({ error: 'Missing service_name or key_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the encrypted API key
    const { data: keyData, error } = await supabase
      .from('admin_api_keys')
      .select('encrypted_key, is_active')
      .eq('service_name', service_name)
      .eq('key_name', key_name)
      .eq('is_active', true)
      .single();

    if (error || !keyData) {
      return new Response(
        JSON.stringify({ error: 'API key not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last_used_at timestamp
    await supabase
      .from('admin_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('service_name', service_name)
      .eq('key_name', key_name);

    // Decrypt and return the API key
    const decrypted_key = simpleDecrypt(keyData.encrypted_key);

    return new Response(
      JSON.stringify({ api_key: decrypted_key }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-api-key function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});