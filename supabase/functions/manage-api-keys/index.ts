import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

// SECURITY FIX: Proper AES encryption for API keys
async function secureEncrypt(text: string): Promise<string> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY environment variable is not configured');
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

async function _secureDecrypt(encryptedText: string): Promise<string> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY environment variable is not configured');
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
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const url = new URL(req.url);
    const method = req.method;
    const action = url.searchParams.get('action');

    if (method === 'GET' && action === 'status') {
      // Return status of all required API keys (from ingestion_sources + env vars)
      // Never exposes actual secret values
      // Only surface keys for sources that are currently enabled. Disabled sources
      // (Foursquare expired, Google Places missing, etc.) don't belong in the "Missing"
      // noise on the admin dashboard.
      const { data: sources } = await supabase
        .from('ingestion_sources')
        .select('name, slug, requires_api_key, is_enabled, source_type')
        .not('requires_api_key', 'is', null)
        .eq('is_enabled', true);

      const requiredKeys: unknown[] = [];
      const seen = new Set<string>();

      for (const source of (sources || [])) {
        const keyName = source.requires_api_key;
        if (seen.has(keyName)) continue;
        seen.add(keyName);

        const envValue = Deno.env.get(keyName);
        let status: 'configured' | 'missing' | 'error' = 'missing';
        let hint = '';

        if (envValue) {
          status = 'configured';
          hint = 'configured';
        }

        requiredKeys.push({
          key_name: keyName,
          status,
          hint,
          used_by: (sources || []).filter(s => s.requires_api_key === keyName).map(s => ({
            name: s.name,
            slug: s.slug,
            source_type: s.source_type,
            is_enabled: s.is_enabled,
          })),
        });
      }

      // Also check common keys not in ingestion_sources.
      // Only keys that are actually consumed somewhere in the codebase belong here;
      // ANTHROPIC/GIPHY/MASTER_ENCRYPTION were historical noise and have been removed.
      const extraKeys = ['FIRECRAWL_API_KEY'];
      for (const keyName of extraKeys) {
        if (seen.has(keyName)) continue;
        const envValue = Deno.env.get(keyName);
        requiredKeys.push({
          key_name: keyName,
          status: envValue ? 'configured' : 'missing',
          hint: envValue ? 'configured' : '',
          used_by: [],
        });
      }

      // Also include custom keys from admin_api_keys table
      const { data: customKeys } = await supabase
        .from('admin_api_keys')
        .select('id, service_name, key_name, description, is_active, created_at, updated_at, last_used_at')
        .order('created_at', { ascending: false });

      return new Response(
        JSON.stringify({ required_keys: requiredKeys, custom_keys: customKeys || [] }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

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
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'POST') {
      const { service_name, key_name, key_value, description } = await req.json();

      if (!service_name || !key_name || !key_value) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      // Encrypt the API key
      const encrypted_key = await secureEncrypt(key_value);

      const { data, error } = await supabase
        .from('admin_api_keys')
        .insert({
          service_name,
          key_name,
          encrypted_key,
          description,
          created_by: (auth as { userId: string }).userId
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          return new Response(
            JSON.stringify({ error: 'API key with this service and name already exists' }),
            { status: 409, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }

      // Return without the encrypted key value
      const { encrypted_key: _, ...safeData } = data;
      return new Response(
        JSON.stringify({ key: safeData }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'PUT') {
      const keyId = url.searchParams.get('id');
      const { service_name, key_name, key_value, description, is_active } = await req.json();

      if (!keyId) {
        return new Response(
          JSON.stringify({ error: 'Missing key ID' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      const updateData: unknown = {};
      if (service_name !== undefined) updateData.service_name = service_name;
      if (key_name !== undefined) updateData.key_name = key_name;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (key_value !== undefined) updateData.encrypted_key = await secureEncrypt(key_value);

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
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'DELETE') {
      const keyId = url.searchParams.get('id');

      if (!keyId) {
        return new Response(
          JSON.stringify({ error: 'Missing key ID' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
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
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-api-keys function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
