import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SECURITY FIX: Proper AES encryption for API keys
async function secureEncrypt(text: string): Promise<string> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY') || 'default-dev-key-change-in-production';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(text);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function secureDecrypt(encryptedText: string): Promise<string> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY') || 'default-dev-key-change-in-production';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const combined = new Uint8Array(atob(encryptedText).split('').map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return new TextDecoder().decode(decrypted);
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
    const decrypted_key = await secureDecrypt(keyData.encrypted_key);

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