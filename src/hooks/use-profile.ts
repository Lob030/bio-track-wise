import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Tier = "bronze" | "silver" | "gold" | "diamond";

const RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, diamond: 4 };

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function tierAllows(userTier: Tier | undefined, min: Tier): boolean {
  if (!userTier) return false;
  return RANK[userTier] >= RANK[min];
}

export function tierLockReason(tier: Tier, module: string): string {
  return `${module} requiere un plan superior a ${tier}. Actualiza tu suscripción para desbloquear.`;
}
