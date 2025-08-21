import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple encryption for demo purposes - in production use proper encryption
function simpleEncrypt(text: string): string {
  return btoa(text); // Base64 encoding - replace with proper encryption
}

function simpleDecrypt(encrypted: string): string {
  return atob(encrypted); // Base64 decoding - replace with proper decryption
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user is authenticated and is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: user, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const method = req.method;

    if (method === 'GET') {
      // List all API keys (without decrypted values)
      const { data: keys, error } = await supabase
        .from('admin_api_keys')
        .select('id, service_name, key_name, description, is_active, created_at, updated_at, last_used_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ keys }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'POST') {
      const { service_name, key_name, key_value, description } = await req.json();

      if (!service_name || !key_name || !key_value) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Encrypt the API key
      const encrypted_key = simpleEncrypt(key_value);

      const { data, error } = await supabase
        .from('admin_api_keys')
        .insert({
          service_name,
          key_name,
          encrypted_key,
          description,
          created_by: user.user.id
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          return new Response(
            JSON.stringify({ error: 'API key with this service and name already exists' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }

      // Return without the encrypted key value
      const { encrypted_key: _, ...safeData } = data;
      return new Response(
        JSON.stringify({ key: safeData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'PUT') {
      const keyId = url.searchParams.get('id');
      const { service_name, key_name, key_value, description, is_active } = await req.json();

      if (!keyId) {
        return new Response(
          JSON.stringify({ error: 'Missing key ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateData: any = {};
      if (service_name !== undefined) updateData.service_name = service_name;
      if (key_name !== undefined) updateData.key_name = key_name;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (key_value !== undefined) updateData.encrypted_key = simpleEncrypt(key_value);

      const { data, error } = await supabase
        .from('admin_api_keys')
        .update(updateData)
        .eq('id', keyId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Return without the encrypted key value
      const { encrypted_key: _, ...safeData } = data;
      return new Response(
        JSON.stringify({ key: safeData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'DELETE') {
      const keyId = url.searchParams.get('id');

      if (!keyId) {
        return new Response(
          JSON.stringify({ error: 'Missing key ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('admin_api_keys')
        .delete()
        .eq('id', keyId);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-api-keys function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});