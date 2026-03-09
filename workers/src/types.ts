export interface Env {
  // KV namespaces
  CACHE: KVNamespace;
  REDIRECTS: KVNamespace;

  // Secrets
  CLOUDFLARE_ZONE_ID: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  OPENWEATHER_API_KEY: string;
  TRAVELPAYOUTS_API_TOKEN: string;
  PEXELS_API_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Vars
  ALLOWED_ORIGINS: string;
}
