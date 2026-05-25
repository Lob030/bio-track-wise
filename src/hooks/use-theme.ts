import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { THEMES, ThemeId } from "@/lib/themes";

/** Convert camelCase → kebab-case for CSS custom property names */
function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

/** Dynamically inject a Google Fonts stylesheet (idempotent) */
function loadGoogleFont(families: string[]) {
  const id = "biotrack-google-fonts";
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  const encoded = families.map((f) => `family=${encodeURIComponent(f)}`).join("&");
  link.href = `https://fonts.googleapis.com/css2?${encoded}&display=swap`;
}

/** Extract font family names from a CSS font-family string for Google Fonts */
function extractGoogleFontNames(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((f) => f.trim().replace(/['"]/g, ""))
    .filter((f) => !["sans-serif", "serif", "monospace", "-apple-system", "BlinkMacSystemFont", "system-ui"].includes(f))
    .map((f) => `${f}:wght@300;400;500;600;700;900`);
}

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

    // ── 1. Color variables (camelCase → kebab-case) ──────────────────────
    Object.entries(theme.colors).forEach(([key, value]) => {
      const kebab = toKebabCase(key);
      root.style.setProperty(`--color-${kebab}`, value);
    });

    // ── 2. Extra aliases needed by styles.css & Tailwind theme ───────────
    // --color-border aliases --color-surface-border
    root.style.setProperty("--color-border", theme.colors.surfaceBorder);
    // --color-surface-hover (used by themes.css hover states)
    root.style.setProperty("--color-surface-hover", theme.colors.surfaceHover);

    // ── 3. Typography ─────────────────────────────────────────────────────
    const bodyFont = theme.typography.family;
    const headFont = theme.typography.headingFamily || bodyFont;
    root.style.setProperty("--font-family", bodyFont);
    root.style.setProperty("--font-family-heading", headFont);

    Object.entries(theme.typography.weights || {}).forEach(([key, value]) => {
      root.style.setProperty(`--font-weight-${key}`, String(value));
    });
    Object.entries(theme.typography.sizes || {}).forEach(([key, value]) => {
      root.style.setProperty(`--font-size-${key}`, value);
    });
    Object.entries(theme.typography.lineHeight || {}).forEach(([key, value]) => {
      root.style.setProperty(`--line-height-${key}`, String(value));
    });
    Object.entries(theme.typography.letterSpacing || {}).forEach(([key, value]) => {
      root.style.setProperty(`--letter-spacing-${key}`, value);
    });

    // ── 4. Effects ────────────────────────────────────────────────────────
    if (theme.effects?.shadows) {
      Object.entries(theme.effects.shadows).forEach(([key, value]) => {
        root.style.setProperty(`--shadow-${key}`, value);
      });
    }
    if (theme.effects?.borderRadius) {
      Object.entries(theme.effects.borderRadius).forEach(([key, value]) => {
        root.style.setProperty(`--radius-${key}`, value);
      });
      // Also update the shadcn --radius token
      root.style.setProperty("--radius", theme.effects.borderRadius.lg);
    }
    if (theme.effects?.transitions) {
      Object.entries(theme.effects.transitions).forEach(([key, value]) => {
        root.style.setProperty(`--transition-${key}`, value);
      });
    }

    // ── 5. Apply background & text color directly to html + body ─────────
    root.style.backgroundColor = theme.colors.background;
    root.style.color = theme.colors.text;
    document.body.style.backgroundColor = theme.colors.background;
    document.body.style.color = theme.colors.text;
    document.body.style.fontFamily = bodyFont;

    // ── 6. Theme attribute & classes ─────────────────────────────────────
    root.setAttribute("data-theme", themeId);

    // Toggle light theme: remove dark class for light theme
    if (themeId === "light") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }

    if (theme.effects?.glow) {
      root.classList.add("theme-glow");
    } else {
      root.classList.remove("theme-glow");
    }
    if (theme.effects?.glitch) {
      root.classList.add("theme-glitch");
    } else {
      root.classList.remove("theme-glitch");
    }

    // ── 7. Load Google Fonts ──────────────────────────────────────────────
    const fontNames = [
      ...extractGoogleFontNames(bodyFont),
      ...extractGoogleFontNames(headFont),
    ].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
    if (fontNames.length > 0) {
      loadGoogleFont(fontNames);
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
