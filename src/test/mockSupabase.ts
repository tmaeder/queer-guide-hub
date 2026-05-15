import { vi } from 'vitest';

type QueryResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Build a chainable mock query that resolves to `result`.
 * Covers the subset of PostgREST builder methods used across the app.
 */
function makeQueryBuilder<T>(result: QueryResult<T>) {
  const builder: Record<string, unknown> = {};
  const chainable = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
    'in', 'is', 'contains', 'containedBy', 'or', 'and', 'not',
    'match', 'filter', 'order', 'limit', 'range', 'returns',
    'maybeSingle', 'single', 'csv', 'overlaps', 'textSearch',
  ];
  for (const m of chainable) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled: (v: QueryResult<T>) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return builder;
}

export interface MockSupabaseOptions {
  /** Map of table name → query result. Tables not listed return empty data. */
  tables?: Record<string, QueryResult<unknown>>;
  /** Auth user. null = signed out. */
  user?: { id: string; email?: string } | null;
  /** RPC name → return value. */
  rpc?: Record<string, QueryResult<unknown>>;
}

/**
 * Create a Vitest-compatible mock of `@/integrations/supabase/client`.
 *
 * Usage:
 *   vi.mock('@/integrations/supabase/client', () => ({
 *     supabase: createMockSupabase({
 *       tables: { venues: { data: [fixtureVenue], error: null } },
 *       user: { id: 'u_1', email: 't@example.com' },
 *     }),
 *   }));
 */
export function createMockSupabase(options: MockSupabaseOptions = {}) {
  const { tables = {}, user = null, rpc = {} } = options;

  return {
    from: vi.fn((table: string) =>
      makeQueryBuilder(tables[table] ?? { data: [], error: null }),
    ),
    rpc: vi.fn((name: string) =>
      Promise.resolve(rpc[name] ?? { data: null, error: null }),
    ),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: user ? { user, access_token: 'mock' } : null },
          error: null,
        }),
      ),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        cb('INITIAL_SESSION', user ? { user } : null);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(() =>
        Promise.resolve({ data: { user, session: null }, error: null }),
      ),
      signInWithOtp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'mock' }, error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/mock' } })),
        remove: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    },
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  };
}
