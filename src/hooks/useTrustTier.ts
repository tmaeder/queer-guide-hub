import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type TrustTier =
  | "visitor"
  | "local"
  | "scout"
  | "steward"
  | "guardian";

export type TrustTierFull = {
  user_id: string;
  tier: TrustTier;
  submissions_accepted: number;
  safety_validated: number;
  endorsements_received: number;
  last_promoted_at: string | null;
};

export const TIER_ORDER: TrustTier[] = [
  "visitor",
  "local",
  "scout",
  "steward",
  "guardian",
];

/** Public tier label for any user — readable by everyone via view. */
export function usePublicTier(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["trustTier", "public", userId],
    enabled: !!userId,
    queryFn: async (): Promise<TrustTier> => {
      const { data, error } = await supabase
        .from("user_public_tiers" as never)
        .select("tier")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as { tier?: TrustTier } | null)?.tier ?? "visitor");
    },
    staleTime: 60_000,
  });
}

/** Full tier row for the signed-in user (counts + last_promoted_at). */
export function useMyTier() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["trustTier", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TrustTierFull> => {
      const { data, error } = await supabase
        .from("user_trust_tiers" as never)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (
        (data as TrustTierFull | null) ?? {
          user_id: user!.id,
          tier: "visitor",
          submissions_accepted: 0,
          safety_validated: 0,
          endorsements_received: 0,
          last_promoted_at: null,
        }
      );
    },
    staleTime: 30_000,
  });
}

/** Thresholds mirror the SQL recompute_user_tier function. */
export const TIER_REQUIREMENTS: Record<
  Exclude<TrustTier, "visitor">,
  { submissions: number; safety: number; endorsements: number; manual?: boolean }
> = {
  local:    { submissions: 1,  safety: 0, endorsements: 0 },
  scout:    { submissions: 5,  safety: 1, endorsements: 0 },
  steward:  { submissions: 15, safety: 3, endorsements: 3 },
  guardian: { submissions: 0,  safety: 0, endorsements: 0, manual: true },
};

export function nextTier(t: TrustTier): TrustTier | null {
  const i = TIER_ORDER.indexOf(t);
  return i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}
