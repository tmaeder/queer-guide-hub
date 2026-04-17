// Helper for querying tables not yet in the generated Database type.
// Usage: untypedFrom('pipeline_errors').select('*') instead of
//        (supabase as unknown as { from: ... }).from('pipeline_errors')
import { supabase } from './client';

type UntypedClient = { from: (table: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc };

export const untypedSupabase = supabase as unknown as UntypedClient;

export function untypedFrom(table: string) {
  return untypedSupabase.from(table);
}
