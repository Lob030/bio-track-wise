import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "operator";

export function useRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, status")
        .eq("user_id", u.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data.role as AppRole;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIsAdmin() {
  const { data: role } = useRole();
  return role === "admin";
}
