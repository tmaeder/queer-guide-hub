/**
 * Supabase client — now a re-export of the Cloudflare Workers API client.
 *
 * All code that imports from "@/integrations/supabase/client" will
 * transparently use the new Workers backend.
 */
export { api as supabase } from '@/integrations/api/client';
