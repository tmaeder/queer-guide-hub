/**
 * API Client — replaces @supabase/supabase-js
 *
 * Provides a compatible API surface so that hooks can migrate incrementally.
 * Uses Cloudflare Workers as the backend.
 *
 * Usage:
 *   import { api } from '@/integrations/api/client';
 *
 *   // Like api.from('venues').select('*')
 *   api.from('venues').select('*').eq('city_id', id).order('name').range(0, 9)
 *
 *   // Like api.rpc('increment_views', { article_id: id })
 *   api.rpc('increment_views', { article_id: id })
 *
 *   // Like api.functions.invoke('fetch-news', { body: { ... } })
 *   api.functions.invoke('fetch-news', { body: { ... } })
 */

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const API_URL = import.meta.env.VITE_API_URL || SUPABASE_URL;

// ─── Session management ───

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number; // timestamp ms
}

interface AuthUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  created_at?: string;
}

let currentSession: Session | null = null;
let currentUser: AuthUser | null = null;
const authListeners: Array<(event: string, session: Session | null) => void> = [];

function loadSession() {
  try {
    const raw = localStorage.getItem('qg_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      currentSession = parsed.session;
      currentUser = parsed.user;
    }
  } catch {
    // ignore
  }
}

function saveSession(session: Session | null, user: AuthUser | null) {
  currentSession = session;
  currentUser = user;
  if (session && user) {
    localStorage.setItem('qg_session', JSON.stringify({ session, user }));
  } else {
    localStorage.removeItem('qg_session');
  }
}

function notifyListeners(event: string) {
  for (const listener of authListeners) {
    try {
      listener(event, currentSession);
    } catch {
      // ignore listener errors
    }
  }
}

// Initialize on load
loadSession();

// ─── HTTP helpers ───

const isSupabase = API_URL.includes('supabase.co');

async function getAccessToken(): Promise<string | null> {
  if (!currentSession) return null;

  // Refresh if token is about to expire (within 60s)
  if (currentSession.expires_at < Date.now() + 60_000) {
    try {
      const refreshUrl = isSupabase
        ? `${API_URL}/auth/v1/token?grant_type=refresh_token`
        : `${API_URL}/auth/refresh`;
      const refreshHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isSupabase) refreshHeaders['apikey'] = SUPABASE_ANON_KEY;
      const resp = await fetch(refreshUrl, {
        method: 'POST',
        headers: refreshHeaders,
        body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
      });
      if (resp.ok) {
        const json = await resp.json();
        let newSession: Session;
        if (isSupabase) {
          // Supabase returns {access_token, refresh_token, expires_in, ...} directly
          newSession = {
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            expires_in: json.expires_in,
            expires_at: Date.now() + json.expires_in * 1000,
          };
          if (json.user) currentUser = json.user;
        } else {
          newSession = {
            ...json.data.session,
            expires_at: Date.now() + json.data.session.expires_in * 1000,
          };
        }
        saveSession(newSession, currentUser);
        notifyListeners('TOKEN_REFRESHED');
      } else {
        // Refresh failed — sign out
        saveSession(null, null);
        notifyListeners('SIGNED_OUT');
        return null;
      }
    } catch {
      return currentSession.access_token; // use existing token as fallback
    }
  }

  return currentSession.access_token;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (isSupabase) {
    headers['apikey'] = SUPABASE_ANON_KEY;
    headers['Authorization'] = `Bearer ${token || SUPABASE_ANON_KEY}`;
  } else if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

// ─── Query Builder (api.from() compatible) ───

type FilterValue = string | number | boolean | null | string[] | number[];

class QueryBuilder<T = unknown> {
  private table: string;
  private params = new URLSearchParams();
  private method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private body: unknown = undefined;
  private singleRow = false;
  private headOnly = false;
  private extraHeaders: Record<string, string> = {};

  constructor(table: string) {
    this.table = table;
  }

  select(
    columns: string = '*',
    opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ) {
    this.params.set('select', columns);
    if (opts?.count) this.params.set('count', opts.count);
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(data: Partial<T> | Partial<T>[]) {
    this.method = 'POST';
    this.body = data;
    return this;
  }

  upsert(data: Partial<T> | Partial<T>[], opts?: { onConflict?: string }) {
    this.method = 'POST';
    this.body = data;
    this.extraHeaders['Prefer'] = 'resolution=merge-duplicates';
    return this;
  }

  update(data: Partial<T>) {
    this.method = 'PATCH';
    this.body = data;
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  // Filters
  eq(column: string, value: FilterValue) {
    this.params.set(column, `eq.${value}`);
    return this;
  }

  neq(column: string, value: FilterValue) {
    this.params.set(column, `neq.${value}`);
    return this;
  }

  gt(column: string, value: FilterValue) {
    this.params.set(column, `gt.${value}`);
    return this;
  }

  gte(column: string, value: FilterValue) {
    this.params.set(column, `gte.${value}`);
    return this;
  }

  lt(column: string, value: FilterValue) {
    this.params.set(column, `lt.${value}`);
    return this;
  }

  lte(column: string, value: FilterValue) {
    this.params.set(column, `lte.${value}`);
    return this;
  }

  like(column: string, pattern: string) {
    this.params.set(column, `like.${pattern}`);
    return this;
  }

  ilike(column: string, pattern: string) {
    this.params.set(column, `ilike.${pattern}`);
    return this;
  }

  is(column: string, value: 'null' | 'true' | 'false') {
    this.params.set(column, `is.${value}`);
    return this;
  }

  in(column: string, values: (string | number)[]) {
    this.params.set(column, `in.(${values.join(',')})`);
    return this;
  }

  not(column: string, op: string, value: FilterValue) {
    this.params.set(column, `not.${op}.${value}`);
    return this;
  }

  or(filters: string) {
    // Simplified — pass through as a query param
    this.params.set('or', filters);
    return this;
  }

  overlaps(column: string, value: unknown[]) {
    this.params.set(column, `ov.{${value.join(',')}}`);
    return this;
  }

  contains(column: string, value: unknown) {
    if (Array.isArray(value)) {
      this.params.set(column, `cs.{${value.join(',')}}`);
    } else {
      this.params.set(column, `cs.{${typeof value === 'string' ? value : JSON.stringify(value)}}`);
    }
    return this;
  }

  // Ordering
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const existing = this.params.get('order');
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    let entry = `${column}.${dir}`;
    if (opts?.nullsFirst === true) entry += '.nullsfirst';
    else if (opts?.nullsFirst === false) entry += '.nullslast';
    this.params.set('order', existing ? `${existing},${entry}` : entry);
    return this;
  }

  // Pagination
  range(from: number, to: number) {
    this.params.set('offset', String(from));
    this.params.set('limit', String(to - from + 1));
    return this;
  }

  limit(count: number) {
    this.params.set('limit', String(count));
    return this;
  }

  single() {
    this.singleRow = true;
    this.params.set('limit', '1');
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    this.params.set('limit', '1');
    return this;
  }

  // Execute
  async then(
    resolve: (value: { data: T | T[] | null; error: Error | null; count?: number }) => void,
    reject?: (error: Error) => void,
  ) {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err as Error);
      else resolve({ data: null, error: err as Error });
    }
  }

  private async execute(): Promise<{ data: T | T[] | null; error: Error | null; count?: number }> {
    const restPrefix = isSupabase ? '/rest/v1' : '/rest';
    let path: string;
    let fetchOpts: RequestInit;

    if (this.method === 'GET') {
      const qs = this.params.toString();
      path = `${restPrefix}/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = { method: 'GET' };
    } else if (this.method === 'POST') {
      const qs = this.params.toString();
      path = `${restPrefix}/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = {
        method: 'POST',
        body: JSON.stringify(this.body),
        headers: {
          ...this.extraHeaders,
          ...(isSupabase ? { Prefer: 'return=representation' } : {}),
        },
      };
    } else if (this.method === 'PATCH') {
      const qs = this.params.toString();
      path = `${restPrefix}/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = {
        method: 'PATCH',
        body: JSON.stringify(this.body),
        headers: isSupabase ? { Prefer: 'return=representation' } : {},
      };
    } else {
      // DELETE
      const qs = this.params.toString();
      path = `${restPrefix}/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = { method: 'DELETE' };
    }

    const resp = await apiFetch(path, fetchOpts);

    if (!resp.ok) {
      const errorBody = (await resp.json().catch(() => ({}))) as Record<string, string>;
      return {
        data: null,
        error: new Error(errorBody?.message || errorBody?.error || `HTTP ${resp.status}`),
      };
    }

    if (isSupabase) {
      // Supabase PostgREST returns raw arrays/objects directly
      const raw = (await resp.json()) as T | T[];
      let data = raw;
      const countHeader = resp.headers.get('content-range');
      const count = countHeader ? parseInt(countHeader.split('/')[1], 10) : undefined;

      if (this.singleRow && Array.isArray(data)) {
        data = data.length > 0 ? (data[0] as T) : (null as T);
      }

      return { data, error: null, count: Number.isNaN(count) ? undefined : count };
    }

    // Workers backend returns {data, error, count} wrapper
    const json = (await resp.json()) as {
      data: T | T[] | null;
      error: string | null;
      count?: number;
    };

    if (json.error) {
      return {
        data: null,
        error: new Error(json.error),
        count: json.count,
      };
    }

    let data = json.data;
    if (this.singleRow && Array.isArray(data)) {
      data = data.length > 0 ? (data[0] as T) : null;
    }

    return { data, error: null, count: json.count };
  }
}

// ─── Storage client ───

const storageClient = {
  from(bucket: string) {
    const storageBase = isSupabase ? `${API_URL}/storage/v1/object` : `${API_URL}/storage`;

    function storageHeaders(token: string | null): Record<string, string> {
      const h: Record<string, string> = {};
      if (isSupabase) h['apikey'] = SUPABASE_ANON_KEY;
      if (token) h['Authorization'] = `Bearer ${token}`;
      else if (isSupabase) h['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
      return h;
    }

    return {
      async upload(path: string, file: File | Blob) {
        const formData = new FormData();
        formData.append('file', file);
        if (!isSupabase) formData.append('path', path);

        const token = await getAccessToken();
        const uploadUrl = isSupabase
          ? `${storageBase}/${bucket}/${path}`
          : `${storageBase}/${bucket}/upload`;
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          headers: storageHeaders(token),
          body: formData,
        });

        const json = (await resp.json()) as { data?: unknown; error?: string; Key?: string };
        return {
          data: json.data || json.Key || null,
          error: json.error
            ? new Error(json.error)
            : !resp.ok
              ? new Error(`HTTP ${resp.status}`)
              : null,
        };
      },

      getPublicUrl(path: string) {
        const publicUrl = isSupabase
          ? `${API_URL}/storage/v1/object/public/${bucket}/${path}`
          : `${storageBase}/${bucket}/public/${path}`;
        return { data: { publicUrl } };
      },

      async remove(paths: string[]) {
        const token = await getAccessToken();
        if (isSupabase) {
          const resp = await fetch(`${storageBase}/${bucket}`, {
            method: 'DELETE',
            headers: { ...storageHeaders(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: paths }),
          });
          return {
            data: null,
            error: !resp.ok ? new Error('Failed to delete some files') : null,
          };
        }
        const results = await Promise.all(
          paths.map((p) =>
            fetch(`${storageBase}/${bucket}/${p}`, {
              method: 'DELETE',
              headers: storageHeaders(token),
            }),
          ),
        );
        const hasError = results.some((r) => !r.ok);
        return {
          data: null,
          error: hasError ? new Error('Failed to delete some files') : null,
        };
      },

      async download(path: string) {
        const token = await getAccessToken();
        const downloadUrl = isSupabase
          ? `${storageBase}/${bucket}/${path}`
          : `${storageBase}/${bucket}/${path}`;
        const resp = await fetch(downloadUrl, {
          headers: storageHeaders(token),
        });
        if (!resp.ok) {
          return { data: null, error: new Error(`Download failed: ${resp.status}`) };
        }
        return { data: await resp.blob(), error: null };
      },
    };
  },
};

// ─── Auth client ───

const authClient = {
  async getSession() {
    return {
      data: { session: currentSession },
      error: null,
    };
  },

  async getUser() {
    if (!currentSession) {
      return { data: { user: null }, error: null };
    }
    return { data: { user: currentUser }, error: null };
  },

  async signUp(credentials: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
  }) {
    const signupUrl = isSupabase ? `${API_URL}/auth/v1/signup` : `${API_URL}/auth/signup`;
    const signupHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isSupabase) signupHeaders['apikey'] = SUPABASE_ANON_KEY;
    const resp = await fetch(signupUrl, {
      method: 'POST',
      headers: signupHeaders,
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        ...(isSupabase
          ? { data: credentials.options?.data }
          : { metadata: credentials.options?.data }),
      }),
    });

    const json = await resp.json();

    if (!resp.ok || json.error) {
      return {
        data: { user: null, session: null },
        error: { message: json.error || json.error_description || json.msg || 'Signup failed' },
      };
    }

    let user: AuthUser;
    let session: Session;
    if (isSupabase) {
      // Supabase returns {access_token, refresh_token, expires_in, user, ...} directly
      user = json.user;
      session = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: json.expires_in,
        expires_at: Date.now() + json.expires_in * 1000,
      };
    } else {
      user = json.data!.user;
      session = {
        ...json.data!.session,
        expires_at: Date.now() + json.data!.session.expires_in * 1000,
      };
    }
    saveSession(session, user);
    notifyListeners('SIGNED_IN');

    return { data: { user, session }, error: null };
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    const signinUrl = isSupabase
      ? `${API_URL}/auth/v1/token?grant_type=password`
      : `${API_URL}/auth/signin`;
    const signinHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isSupabase) signinHeaders['apikey'] = SUPABASE_ANON_KEY;
    const resp = await fetch(signinUrl, {
      method: 'POST',
      headers: signinHeaders,
      body: JSON.stringify(credentials),
    });

    const json = await resp.json();

    if (!resp.ok || json.error) {
      return {
        data: { user: null, session: null },
        error: { message: json.error || json.error_description || json.msg || 'Login failed' },
      };
    }

    let user: AuthUser;
    let session: Session;
    if (isSupabase) {
      user = json.user;
      session = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: json.expires_in,
        expires_at: Date.now() + json.expires_in * 1000,
      };
    } else {
      user = json.data!.user;
      session = {
        ...json.data!.session,
        expires_at: Date.now() + json.data!.session.expires_in * 1000,
      };
    }
    saveSession(session, user);
    notifyListeners('SIGNED_IN');

    return { data: { user, session }, error: null };
  },

  async signOut() {
    if (currentSession) {
      const signoutPath = isSupabase ? '/auth/v1/logout' : '/auth/signout';
      await apiFetch(signoutPath, { method: 'POST' }).catch(() => {});
    }
    saveSession(null, null);
    notifyListeners('SIGNED_OUT');
    return { error: null };
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    authListeners.push(callback);

    // Fire initial event
    setTimeout(() => {
      callback(currentSession ? 'INITIAL_SESSION' : 'INITIAL_SESSION', currentSession);
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe() {
            const idx = authListeners.indexOf(callback);
            if (idx >= 0) authListeners.splice(idx, 1);
          },
        },
      },
    };
  },
};

// ─── Functions client (edge function invocations) ───

/** Maps legacy edge-function names to grouped API paths. */
const ROUTE_MAP: Record<string, string> = {
  // Admin
  'admin-create-user': 'admin/create-user',
  'secure-passkey-operations': 'admin/passkey',
  // Automation
  'content-automation': 'automation/content',
  'categorize-tags': 'automation/categorize-tags',
  'auto-tag-content': 'automation/auto-tag-content',
  'workflow-dispatcher': 'automation/workflow',
  'clean-merge-all-duplicates': 'automation/clean-merge-duplicates',
  'create-moderation-flag': 'automation/create-moderation-flag',
  'sync-content-links': 'automation/sync-content-links',
  // Enrichment
  'enrich-venue': 'enrichment/venue',
  'fetch-wikipedia-data': 'enrichment/fetch-wikipedia',
  'fetch-personality-data': 'enrichment/fetch-personality',
  'fetch-and-store-city-images': 'enrichment/fetch-city-images',
  'fetch-news': 'enrichment/fetch-news',
  'geo-link-content': 'enrichment/geo-link',
  'link-locations': 'enrichment/link-locations',
  'resolve-or-create-city': 'enrichment/resolve-city',
  'populate-optimization-status': 'enrichment/populate-optimization-status',
  'get-wikipedia-info': 'enrichment/fetch-wikipedia',
  // Imports
  'import-venues-csv': 'imports/csv',
  'import-events-csv': 'imports/csv',
  'import-tags-csv': 'imports/csv',
  'import-personalities-csv': 'imports/csv',
  'import-adult-models-csv': 'imports/csv',
  'import-city-data': 'imports/city-data',
  'import-country-data': 'imports/country-data',
  'import-foursquare-venues': 'imports/foursquare',
  'import-google-places-venues': 'imports/google-places',
  'import-tripadvisor-venues': 'imports/tripadvisor',
  'import-tomtom-venues': 'imports/tomtom',
  'import-eventbrite-events': 'imports/eventbrite',
  'import-ticketmaster-events': 'imports/ticketmaster',
  'import-ilga-data': 'imports/ilga-data',
  'import-awin-products': 'imports/awin-products',
  'background-import-manager': 'imports/background',
  'bulk-create-personalities': 'imports/bulk-personalities',
  'bulk-create-ai-tags': 'imports/bulk-ai-tags',
  'bulk-scrape-events': 'imports/bulk-scrape-events',
  // Ingestion
  'ingestion-pipeline': 'ingestion/pipeline',
  'ingestion-review-api': 'ingestion/review',
  // Scraping
  'scrape-web-sources': 'scraping/web-sources',
  'scrape-gaycities-events': 'scraping/gaycities-events',
  'scrape-spartacus': 'scraping/spartacus',
  'scan-links': 'scraping/scan-links',
  'validate-links': 'scraping/validate-links',
  'scan-project-images': 'scraping/scan-project-images',
  // Media
  'analyze-flyer': 'media/analyze-flyer',
  'optimize-images-batch': 'media/optimize-images',
  'process-audio': 'media/process-audio',
  'process-video': 'media/process-video',
  'store-tag-images': 'media/store-tag-images',
  'reimport-personality-images': 'media/reimport-personality-images',
  // Email
  'send-mailbox-email': 'email/send-mailbox',
  'send-templated-email': 'email/send-templated',
  'send-group-notifications': 'email/send-group-notification',
  // API Keys
  'manage-api-keys': 'api-keys/manage',
};

const functionsClient = {
  async invoke(
    functionName: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      method?: string;
    },
  ) {
    // For Supabase, use the original function name via /functions/v1/
    // For Workers, use the ROUTE_MAP to resolve grouped paths
    const resolvedPath = isSupabase
      ? `functions/v1/${functionName}`
      : ROUTE_MAP[functionName] || functionName;
    const method = options?.method || (options?.body ? 'POST' : 'GET');
    const token = await getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    };
    if (isSupabase) {
      headers['apikey'] = SUPABASE_ANON_KEY;
      headers['Authorization'] = `Bearer ${token || SUPABASE_ANON_KEY}`;
    } else if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const resp = await fetch(`${API_URL}/${resolvedPath}`, {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      const data = await resp.json();

      if (!resp.ok) {
        return {
          data: null,
          error: { message: (data as Record<string, string>)?.error || `HTTP ${resp.status}` },
        };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  },
};

// ─── Realtime channel stub (not yet supported on Cloudflare Workers) ───

let realtimeWarned = false;

interface ChannelStub {
  on(event: string, filter: unknown, callback: (...args: unknown[]) => void): ChannelStub;
  subscribe(callback?: (status: string) => void): ChannelStub;
  unsubscribe(): void;
  send(payload: unknown): Promise<void>;
}

function createChannelStub(_name: string): ChannelStub {
  if (!realtimeWarned) {
    console.warn('[API] Realtime channels are not yet supported. channel() calls are no-ops.');
    realtimeWarned = true;
  }
  const stub: ChannelStub = {
    on() {
      return stub;
    },
    subscribe(callback) {
      if (callback) setTimeout(() => callback('SUBSCRIBED'), 0);
      return stub;
    },
    unsubscribe() {},
    async send() {},
  };
  return stub;
}

// ─── Main API object (drop-in replacement for supabase client) ───

export const api = {
  from<T = unknown>(table: string) {
    return new QueryBuilder<T>(table);
  },

  async rpc(functionName: string, params?: Record<string, unknown>) {
    const rpcPrefix = isSupabase ? '/rest/v1/rpc' : '/rpc';
    const resp = await apiFetch(`${rpcPrefix}/${functionName}`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });

    if (!resp.ok) {
      const errorBody = (await resp.json().catch(() => ({}))) as Record<string, string>;
      return {
        data: null,
        error: new Error(errorBody?.message || errorBody?.error || `HTTP ${resp.status}`),
      };
    }

    if (isSupabase) {
      const data = await resp.json();
      return { data, error: null };
    }

    const json = (await resp.json()) as { data: unknown; error: string | null };
    return {
      data: json.data,
      error: json.error ? new Error(json.error) : null,
    };
  },

  channel(name: string): ChannelStub {
    return createChannelStub(name);
  },

  removeChannel(_channel: ChannelStub) {
    // no-op
  },

  auth: authClient,
  storage: storageClient,
  functions: functionsClient,
};
