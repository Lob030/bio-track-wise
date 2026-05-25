import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { THEMES, ThemeId } from "@/lib/themes";

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>("dark-slate");
  const queryClient = useQueryClient();

  // Load user's theme preference from database
  const { data: userPreference } = useQuery({
    queryKey: ["user-theme-preference"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;

      const { data } = await supabase
        .from("profiles")
        .select("preferred_theme")
        .eq("id", user.user.id)
        .single();

      return (data?.preferred_theme as ThemeId) || "dark-slate";
    },
  });

  // Update theme in database
  const updateThemeMutation = useMutation({
    mutationFn: async (themeId: ThemeId) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      await supabase
        .from("profiles")
        .update({ preferred_theme: themeId })
        .eq("id", user.user.id);

      return themeId;
    },
    onSuccess: (themeId) => {
      setCurrentTheme(themeId);
      applyTheme(themeId);
      queryClient.invalidateQueries({ queryKey: ["user-theme-preference"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // Apply theme to DOM
  function applyTheme(themeId: ThemeId) {
    const theme = THEMES[themeId];
    if (!theme) return;
    const root = document.documentElement;

    // Set CSS variables
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    root.style.setProperty("--font-family", theme.typography.family);
    if (theme.typography.headingFamily) {
      root.style.setProperty("--font-family-heading", theme.typography.headingFamily);
    }

    // Apply data attribute for conditional styling
    root.setAttribute("data-theme", themeId);

    // Apply effects
    if (theme.effects.glow) {
      root.classList.add("theme-glow");
    } else {
      root.classList.remove("theme-glow");
    }

    if (theme.effects.glitch) {
      root.classList.add("theme-glitch");
    } else {
      root.classList.remove("theme-glitch");
    }

    localStorage.setItem("preferred-theme", themeId);
  }

  // Initialize theme on mount
  useEffect(() => {
    const savedTheme = (localStorage.getItem("preferred-theme") as ThemeId) || 
                       userPreference || 
                       "dark-slate";
    setCurrentTheme(savedTheme);
    applyTheme(savedTheme);
  }, [userPreference]);

  return {
    currentTheme,
    setTheme: (themeId: ThemeId) => updateThemeMutation.mutate(themeId),
    isLoading: updateThemeMutation.isPending,
    allThemes: Object.values(THEMES),
  };
}
