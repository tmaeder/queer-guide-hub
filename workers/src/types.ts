export interface Env {
  // D1 Database
  DB: D1Database;

  // R2 Storage
  STORAGE: R2Bucket;

  // KV namespaces
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  REDIRECTS: KVNamespace;

  // Auth
  JWT_SECRET: string;

  // Cloudflare
  CLOUDFLARE_ZONE_ID: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;

  // Turnstile
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;

  // External APIs
  OPENWEATHER_API_KEY: string;
  TRAVELPAYOUTS_API_TOKEN: string;
  PEXELS_API_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;

  // Email
  RESEND_API_KEY: string;
  EMAIL_FROM: string;

  // AI
  AI: any;

  // Mapbox
  MAPBOX_TOKEN: string;

  // Vars
  ALLOWED_ORIGINS: string;
}

/** Authenticated user stored on request context */
export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

/** Standard API response envelope */
export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  count?: number;
}
