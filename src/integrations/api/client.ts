/**
 * API Client — replaces @supabase/supabase-js
 *
 * Provides a compatible API surface so that hooks can migrate incrementally.
 * Uses Cloudflare Workers as the backend.
 *
 * Usage:
 *   import { api } from '@/integrations/api/client';
 *
 *   // Like supabase.from('venues').select('*')
 *   api.from('venues').select('*').eq('city_id', id).order('name').range(0, 9)
 *
 *   // Like supabase.rpc('increment_views', { article_id: id })
 *   api.rpc('increment_views', { article_id: id })
 *
 *   // Like supabase.functions.invoke('fetch-news', { body: { ... } })
 *   api.functions.invoke('fetch-news', { body: { ... } })
 */

const API_URL = import.meta.env.VITE_API_URL || '';

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

async function getAccessToken(): Promise<string | null> {
  if (!currentSession) return null;

  // Refresh if token is about to expire (within 60s)
  if (currentSession.expires_at < Date.now() + 60_000) {
    try {
      const resp = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: currentSession.refresh_token }),
      });
      if (resp.ok) {
        const { data } = await resp.json();
        const newSession: Session = {
          ...data.session,
          expires_at: Date.now() + data.session.expires_in * 1000,
        };
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
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

// ─── Query Builder (supabase.from() compatible) ───

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
    // D1 doesn't have array overlap; use LIKE as approximation
    this.params.set(column, `like.%${JSON.stringify(value)}%`);
    return this;
  }

  contains(column: string, value: unknown) {
    this.params.set(column, `like.%${typeof value === 'string' ? value : JSON.stringify(value)}%`);
    return this;
  }

  // Ordering
  order(column: string, opts?: { ascending?: boolean }) {
    const existing = this.params.get('order');
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    const entry = `${column}.${dir}`;
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
    let path: string;
    let fetchOpts: RequestInit;

    if (this.method === 'GET') {
      const qs = this.params.toString();
      path = `/rest/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = { method: 'GET' };
    } else if (this.method === 'POST') {
      const qs = this.params.toString();
      path = `/rest/${this.table}${qs ? `?${qs}` : ''}`;
      fetchOpts = {
        method: 'POST',
        body: JSON.stringify(this.body),
        headers: this.extraHeaders,
      };
    } else if (this.method === 'PATCH') {
      // Find ID from eq filter
      const idParam = this.params.get('id');
      const id = idParam?.replace('eq.', '') || '';
      path = `/rest/${this.table}/${id}`;
      fetchOpts = {
        method: 'PATCH',
        body: JSON.stringify(this.body),
      };
    } else {
      // DELETE
      const idParam = this.params.get('id');
      const id = idParam?.replace('eq.', '') || '';
      path = `/rest/${this.table}/${id}`;
      fetchOpts = { method: 'DELETE' };
    }

    const resp = await apiFetch(path, fetchOpts);
    const json = (await resp.json()) as {
      data: T | T[] | null;
      error: string | null;
      count?: number;
    };

    if (!resp.ok || json.error) {
      return {
        data: null,
        error: new Error(json.error || `HTTP ${resp.status}`),
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
    return {
      async upload(path: string, file: File | Blob) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        const token = await getAccessToken();
        const resp = await fetch(`${API_URL}/storage/${bucket}/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        const json = (await resp.json()) as { data: unknown; error: string | null };
        return {
          data: json.data,
          error: json.error ? new Error(json.error) : null,
        };
      },

      getPublicUrl(path: string) {
        return {
          data: {
            publicUrl: `${API_URL}/storage/${bucket}/public/${path}`,
          },
        };
      },

      async remove(paths: string[]) {
        const token = await getAccessToken();
        const results = await Promise.all(
          paths.map((p) =>
            fetch(`${API_URL}/storage/${bucket}/${p}`, {
              method: 'DELETE',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
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
        const resp = await fetch(`${API_URL}/storage/${bucket}/${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
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
    const resp = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        metadata: credentials.options?.data,
      }),
    });

    const json = (await resp.json()) as {
      data?: { user: AuthUser; session: Session };
      error?: string;
    };

    if (!resp.ok || json.error) {
      return {
        data: { user: null, session: null },
        error: { message: json.error || 'Signup failed' },
      };
    }

    const session = {
      ...json.data!.session,
      expires_at: Date.now() + json.data!.session.expires_in * 1000,
    };
    saveSession(session, json.data!.user);
    notifyListeners('SIGNED_IN');

    return { data: { user: json.data!.user, session }, error: null };
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    const resp = await fetch(`${API_URL}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const json = (await resp.json()) as {
      data?: { user: AuthUser; session: Session };
      error?: string;
    };

    if (!resp.ok || json.error) {
      return {
        data: { user: null, session: null },
        error: { message: json.error || 'Login failed' },
      };
    }

    const session = {
      ...json.data!.session,
      expires_at: Date.now() + json.data!.session.expires_in * 1000,
    };
    saveSession(session, json.data!.user);
    notifyListeners('SIGNED_IN');

    return { data: { user: json.data!.user, session }, error: null };
  },

  async signOut() {
    if (currentSession) {
      await apiFetch('/auth/signout', { method: 'POST' }).catch(() => {});
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

const functionsClient = {
  async invoke(
    functionName: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      method?: string;
    },
  ) {
    const method = options?.method || (options?.body ? 'POST' : 'GET');
    const token = await getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    };
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const resp = await fetch(`${API_URL}/${functionName}`, {
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

// ─── Main API object (drop-in replacement for supabase client) ───

export const api = {
  from<T = unknown>(table: string) {
    return new QueryBuilder<T>(table);
  },

  async rpc(functionName: string, params?: Record<string, unknown>) {
    const resp = await apiFetch(`/rpc/${functionName}`, {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });

    const json = (await resp.json()) as { data: unknown; error: string | null };
    return {
      data: json.data,
      error: json.error ? new Error(json.error) : null,
    };
  },

  auth: authClient,
  storage: storageClient,
  functions: functionsClient,
};

// Re-export for backward compatibility
export { api as supabase };
