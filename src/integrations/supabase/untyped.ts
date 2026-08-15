// Helper for querying tables not yet in the generated Database type.
// Usage: untypedFrom('pipeline_errors').select('*') instead of
//        (supabase as unknown as { from: ... }).from('pipeline_errors')
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * A schema with ONE index-signature table, so `from(string)` resolves to a
 * single query builder instead of a union over every table in the database.
 *
 * WHY THIS EXISTS — a compile-time scaling problem, not a style choice.
 *
 * This helper used to be typed `from: (table: string) => ReturnType<typeof
 * supabase.from>`. With no type argument `supabase.from` resolves to the union
 * of EVERY table's builder, so an "untyped" escape hatch ended up carrying the
 * full typed union — and it grew with the schema.
 *
 * That is not free. Regenerating `types.ts` took the table count from 439 to
 * 451, and `useEntityImageAssets` — a file that PR did not touch — began
 * failing with TS2589, "type instantiation is excessively deep and possibly
 * infinite", on a four-call chain. Nothing was wrong with that code; the union
 * underneath had simply outgrown what TypeScript will instantiate, and the next
 * table added would have picked some other file at random.
 *
 * An index-signature schema collapses the union to one member while keeping the
 * REAL builder API — every method, correct chaining, correct awaited shape.
 * Rows are permissive, which is the honest contract here: this helper exists
 * for tables OUTSIDE the generated types, so there was never a schema to check
 * them against. Callers that want a shape assert one, exactly as before.
 *
 * Use the typed `supabase.from()` whenever the table IS in `types.ts`.
 */
type LooseRow = Record<string, unknown>;

interface LooseDatabase {
  public: {
    Tables: {
      [table: string]: {
        Row: LooseRow;
        Insert: LooseRow;
        Update: LooseRow;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    /**
     * An index signature, NOT an empty record — `untypedSupabase.rpc()` is part
     * of this helper's surface and an empty `Functions` map types every function
     * name as `never`. The first version of this fix did exactly that and broke
     * 26 call sites across 8 files with "Argument of type '\"quest_progress\"'
     * is not assignable to parameter of type 'never'", which is the same class
     * of bug as the union it replaced: the escape hatch refusing the thing it
     * exists to allow.
     */
    Functions: {
      [fn: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

type UntypedClient = SupabaseClient<LooseDatabase>;

export const untypedSupabase = supabase as unknown as UntypedClient;

export function untypedFrom(table: string) {
  return untypedSupabase.from(table);
}

/**
 * Call an RPC that isn't in the generated Database type. Centralizes the one
 * cast here so call sites stay free of ad-hoc `as any` / `as never` on the RPC
 * name. Pass the expected return shape as `T`; the assertion is the caller's
 * honest contract with the function, not a blanket `any`.
 */
export async function untypedRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  // Bind, because supabase-js's rpc() reads `this.rest` and an unbound
  // reference throws "Cannot read properties of undefined (reading 'rest')".
  //
  // Bound through `untypedSupabase` rather than `supabase`: they are the same
  // object at runtime, but the typed client's `rpc` is generic over all 933
  // generated functions and instantiating it here was the last TS2589 left in
  // the repo — the same depth problem as the `from` union above, in the same
  // file. The loose client's index-signature `Functions` keeps it shallow.
  const call = untypedSupabase.rpc.bind(untypedSupabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await call(fn, args);
  return { data: (data ?? null) as T | null, error };
}
