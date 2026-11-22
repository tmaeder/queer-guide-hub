import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SpotKind = 'place' | 'organization';

type RpcResult<T> = { data: T | null; error: { message: string } | null };
// resolve_spot postdates the generated types snapshot.
const callRpc = <T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResult<T>>)(
    name,
    args,
  );

/** Whether a /spots slug names a place (venue) or an organisation; null when neither. */
export function useSpotKind(slug: string | undefined) {
  return useQuery({
    queryKey: ['spot-kind', slug],
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SpotKind | null> => {
      const { data, error } = await callRpc<SpotKind>('resolve_spot', { p_slug: slug });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}
