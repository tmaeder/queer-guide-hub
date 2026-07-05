// Helper for querying tables not yet in the generated Database type.
// Usage: untypedFrom('pipeline_errors').select('*') instead of
//        (supabase as unknown as { from: ... }).from('pipeline_errors')
import { supabase } from './client';

type UntypedClient = { from: (table: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc };

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
  // Bind to `supabase` — supabase-js's rpc() reads `this.rest`, so calling an
  // unbound reference throws "Cannot read properties of undefined (reading 'rest')".
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await call(fn, args);
  return { data: (data ?? null) as T | null, error };
}
