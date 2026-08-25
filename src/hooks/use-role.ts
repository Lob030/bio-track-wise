import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user";

export function useRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .maybeSingle();
      // If no row in user_roles → owner/admin
      return (data?.role ?? "admin") as AppRole;
    },
    staleTime: 5 * 60 * 1000, // 5 min — roles don't change often
  });
}

export function useIsAdmin() {
  const { data: role } = useRole();
  return role === "admin";
}
