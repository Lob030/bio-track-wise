export type ThemeId =
  | "dark-slate"
  | "light"
  | "cyberpunk"
  | "forest"
  | "ocean"
  | "sunset"
  | "nord";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  icon: string;
  description: string;
  colors: {
    background: string;
    surface: string;
    surfaceHover: string;
    surfaceBorder: string;
    text: string;
    textMuted: string;
    textInverse: string;
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    accentSecondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    overlay: string;
    gradient: string;
  };
  typography: {
    family: string;
    headingFamily?: string;
    weights: { light: number; regular: number; medium: number; semibold: number; bold: number };
    sizes: { xs: string; sm: string; base: string; lg: string; xl: string; "2xl": string };
    lineHeight: { tight: number; normal: number; relaxed: number };
    letterSpacing: { tight: string; normal: string; wide: string };
  };
  effects: {
    glow?: boolean;
    gradients?: boolean;
    glitch?: boolean;
    shadows: { sm: string; md: string; lg: string; xl: string };
    borderRadius: { sm: string; md: string; lg: string; xl: string };
    transitions: { fast: string; normal: string; slow: string };
  };
}

// Shared defaults to keep palettes terse and consistent
const W = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 };
const SIZES = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "0.9375rem",
  lg: "1.0625rem",
  xl: "1.25rem",
  "2xl": "1.625rem",
};
const LH = { tight: 1.25, normal: 1.55, relaxed: 1.75 };
const LS = { tight: "-0.02em", normal: "-0.005em", wide: "0.01em" };
const RADIUS = { sm: "0.5rem", md: "0.625rem", lg: "0.75rem", xl: "1rem" };
const TRANS = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  normal: "220ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "320ms cubic-bezier(0.4, 0, 0.2, 1)",
};

export const THEMES: Record<ThemeId, ThemeConfig> = {
  // ─────────────────────────────────────────────────────────────────────────
  // 1 · Midnight Pro — Linear-inspired premium dark
  // ─────────────────────────────────────────────────────────────────────────
  "dark-slate": {
    id: "dark-slate",
    name: "Midnight Pro",
    icon: "🌙",
    description: "Sofisticado, premium, profesional",
    colors: {
      background: "#0b0f1a",
      surface: "#131826",
      surfaceHover: "#1c2236",
      surfaceBorder: "#252c42",
      text: "#f1f5f9",
      textMuted: "#8a93a8",
      textInverse: "#0b0f1a",
      primary: "#2dd4bf",
      primaryHover: "#14b8a6",
      secondary: "#38bdf8",
      accent: "#1c2236",
      accentSecondary: "#6366f1",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#f43f5e",
      info: "#38bdf8",
      overlay: "rgba(11, 15, 26, 0.92)",
      gradient: "linear-gradient(135deg, #2dd4bf 0%, #38bdf8 100%)",
    },
    typography: {
      family: "'Inter', -apple-system, system-ui, sans-serif",
      headingFamily: "'Inter', -apple-system, system-ui, sans-serif",
      weights: W,
      sizes: SIZES,
      lineHeight: LH,
      letterSpacing: LS,
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(0,0,0,0.35)",
        md: "0 4px 12px rgba(0,0,0,0.35)",
        lg: "0 12px 32px rgba(0,0,0,0.45)",
        xl: "0 24px 48px rgba(0,0,0,0.55)",
      },
      borderRadius: RADIUS,
      transitions: TRANS,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2 · Crystal Clear — Vercel/Stripe-style refined light
  // ─────────────────────────────────────────────────────────────────────────
  light: {
    id: "light",
    name: "Crystal Clear",
    icon: "☀️",
    description: "Limpio, moderno, minimalista",
    colors: {
      background: "#fafafa",
      surface: "#ffffff",
      surfaceHover: "#f4f4f5",
      surfaceBorder: "#e4e4e7",
      text: "#0a0a0a",
      textMuted: "#52525b",
      textInverse: "#ffffff",
      primary: "#4f46e5",
      primaryHover: "#4338ca",
      secondary: "#7c3aed",
      accent: "#f4f4f5",
      accentSecondary: "#0ea5e9",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
      info: "#0284c7",
      overlay: "rgba(10, 10, 10, 0.55)",
      gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    },
    typography: {
      family: "'Inter', -apple-system, system-ui, sans-serif",
      headingFamily: "'Inter', -apple-system, system-ui, sans-serif",
      weights: W,
      sizes: SIZES,
      lineHeight: LH,
      letterSpacing: LS,
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(15,23,42,0.06)",
        md: "0 2px 8px rgba(15,23,42,0.08)",
        lg: "0 8px 24px rgba(15,23,42,0.10)",
        xl: "0 20px 40px rgba(15,23,42,0.14)",
      },
      borderRadius: RADIUS,
      transitions: TRANS,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3 · Neon City — Cyberpunk with controlled glow
  // ─────────────────────────────────────────────────────────────────────────
  cyberpunk: {
    id: "cyberpunk",
    name: "Neon City",
    icon: "⚡",
    description: "Futurista, vibrante, electrizante",
    colors: {
      background: "#0a0418",
      surface: "#150a2e",
      surfaceHover: "#1f1142",
      surfaceBorder: "#3a1e6e",
      text: "#f5f0ff",
      textMuted: "#a78bfa",
      textInverse: "#0a0418",
      primary: "#c084fc",
      primaryHover: "#a855f7",
      secondary: "#f472b6",
      accent: "#1f1142",
      accentSecondary: "#22d3ee",
      success: "#22d3ee",
      warning: "#fbbf24",
      error: "#fb7185",
      info: "#22d3ee",
      overlay: "rgba(10, 4, 24, 0.92)",
      gradient: "linear-gradient(135deg, #c084fc 0%, #f472b6 100%)",
    },
    typography: {
      family: "'JetBrains Mono', 'Fira Code', monospace",
      headingFamily: "'JetBrains Mono', 'Fira Code', monospace",
      weights: { light: 400, regular: 500, medium: 600, semibold: 700, bold: 800 },
      sizes: { ...SIZES, base: "0.9375rem" },
      lineHeight: { tight: 1.3, normal: 1.6, relaxed: 1.8 },
      letterSpacing: { tight: "0em", normal: "0.01em", wide: "0.04em" },
    },
    effects: {
      glow: true,
      gradients: true,
      glitch: true,
      shadows: {
        sm: "0 0 8px rgba(192,132,252,0.25)",
        md: "0 0 16px rgba(192,132,252,0.30)",
        lg: "0 0 28px rgba(192,132,252,0.35)",
        xl: "0 0 48px rgba(192,132,252,0.40)",
      },
      borderRadius: { sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem" },
      transitions: { fast: "120ms linear", normal: "200ms linear", slow: "300ms linear" },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4 · Deep Forest — Organic, calm
  // ─────────────────────────────────────────────────────────────────────────
  forest: {
    id: "forest",
    name: "Deep Forest",
    icon: "🌲",
    description: "Natural, sereno, orgánico",
    colors: {
      background: "#0b1812",
      surface: "#142620",
      surfaceHover: "#1c352c",
      surfaceBorder: "#264a3c",
      text: "#ecfdf5",
      textMuted: "#86b89c",
      textInverse: "#0b1812",
      primary: "#34d399",
      primaryHover: "#10b981",
      secondary: "#a3e635",
      accent: "#1c352c",
      accentSecondary: "#facc15",
      success: "#34d399",
      warning: "#fbbf24",
      error: "#f87171",
      info: "#22d3ee",
      overlay: "rgba(11, 24, 18, 0.92)",
      gradient: "linear-gradient(135deg, #34d399 0%, #a3e635 100%)",
    },
    typography: {
      family: "'Inter', system-ui, sans-serif",
      headingFamily: "'Inter', system-ui, sans-serif",
      weights: W,
      sizes: SIZES,
      lineHeight: { tight: 1.3, normal: 1.6, relaxed: 1.85 },
      letterSpacing: { tight: "-0.015em", normal: "0em", wide: "0.015em" },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0,0,0,0.25)",
        md: "0 4px 12px rgba(0,0,0,0.30)",
        lg: "0 10px 24px rgba(0,0,0,0.35)",
        xl: "0 20px 40px rgba(0,0,0,0.40)",
      },
      borderRadius: { sm: "0.625rem", md: "0.75rem", lg: "0.875rem", xl: "1.125rem" },
      transitions: { fast: "180ms ease-out", normal: "260ms ease-out", slow: "420ms ease-out" },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5 · Deep Ocean — Corporate, serene
  // ─────────────────────────────────────────────────────────────────────────
  ocean: {
    id: "ocean",
    name: "Deep Ocean",
    icon: "🌊",
    description: "Profundo, tranquilo, profesional",
    colors: {
      background: "#061321",
      surface: "#0f2237",
      surfaceHover: "#173049",
      surfaceBorder: "#22456a",
      text: "#f0f9ff",
      textMuted: "#7dadd0",
      textInverse: "#061321",
      primary: "#38bdf8",
      primaryHover: "#0ea5e9",
      secondary: "#22d3ee",
      accent: "#173049",
      accentSecondary: "#6366f1",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#f43f5e",
      info: "#22d3ee",
      overlay: "rgba(6, 19, 33, 0.92)",
      gradient: "linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)",
    },
    typography: {
      family: "'Inter', system-ui, sans-serif",
      headingFamily: "'Inter', system-ui, sans-serif",
      weights: W,
      sizes: SIZES,
      lineHeight: LH,
      letterSpacing: LS,
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0,0,0,0.30)",
        md: "0 4px 14px rgba(0,0,0,0.32)",
        lg: "0 12px 28px rgba(0,0,0,0.38)",
        xl: "0 24px 48px rgba(0,0,0,0.45)",
      },
      borderRadius: RADIUS,
      transitions: TRANS,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6 · Golden Hour — Warm, elegant
  // ─────────────────────────────────────────────────────────────────────────
  sunset: {
    id: "sunset",
    name: "Golden Hour",
    icon: "🌅",
    description: "Cálido, elegante, acogedor",
    colors: {
      background: "#15100a",
      surface: "#221710",
      surfaceHover: "#2f2018",
      surfaceBorder: "#473023",
      text: "#fef3e2",
      textMuted: "#c9a87a",
      textInverse: "#15100a",
      primary: "#fbbf24",
      primaryHover: "#f59e0b",
      secondary: "#fb923c",
      accent: "#2f2018",
      accentSecondary: "#f87171",
      success: "#84cc16",
      warning: "#fbbf24",
      error: "#f87171",
      info: "#fb923c",
      overlay: "rgba(21, 16, 10, 0.92)",
      gradient: "linear-gradient(135deg, #fbbf24 0%, #fb923c 100%)",
    },
    typography: {
      family: "'Inter', system-ui, sans-serif",
      headingFamily: "'Playfair Display', 'Inter', serif",
      weights: W,
      sizes: { ...SIZES, "2xl": "1.75rem" },
      lineHeight: { tight: 1.2, normal: 1.6, relaxed: 1.8 },
      letterSpacing: { tight: "-0.02em", normal: "0em", wide: "0.02em" },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0,0,0,0.30)",
        md: "0 6px 16px rgba(0,0,0,0.32)",
        lg: "0 14px 32px rgba(0,0,0,0.38)",
        xl: "0 24px 48px rgba(0,0,0,0.45)",
      },
      borderRadius: { sm: "0.5rem", md: "0.75rem", lg: "0.875rem", xl: "1.125rem" },
      transitions: { fast: "180ms ease-out", normal: "280ms ease-out", slow: "440ms ease-out" },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7 · Arctic Frost — Nordic minimalism
  // ─────────────────────────────────────────────────────────────────────────
  nord: {
    id: "nord",
    name: "Arctic Frost",
    icon: "❄️",
    description: "Minimalista, fresco, nórdico",
    colors: {
      background: "#242933",
      surface: "#2e3440",
      surfaceHover: "#3b4252",
      surfaceBorder: "#434c5e",
      text: "#eceff4",
      textMuted: "#9099a8",
      textInverse: "#2e3440",
      primary: "#88c0d0",
      primaryHover: "#5e81ac",
      secondary: "#81a1c1",
      accent: "#3b4252",
      accentSecondary: "#b48ead",
      success: "#a3be8c",
      warning: "#ebcb8b",
      error: "#bf616a",
      info: "#88c0d0",
      overlay: "rgba(46, 52, 64, 0.92)",
      gradient: "linear-gradient(135deg, #88c0d0 0%, #5e81ac 100%)",
    },
    typography: {
      family: "'Inter', 'IBM Plex Sans', system-ui, sans-serif",
      headingFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif",
      weights: W,
      sizes: SIZES,
      lineHeight: LH,
      letterSpacing: { tight: "-0.015em", normal: "0em", wide: "0.015em" },
    },
    effects: {
      glow: false,
      gradients: false,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(0,0,0,0.18)",
        md: "0 3px 8px rgba(0,0,0,0.22)",
        lg: "0 8px 20px rgba(0,0,0,0.26)",
        xl: "0 16px 36px rgba(0,0,0,0.32)",
      },
      borderRadius: { sm: "0.375rem", md: "0.5rem", lg: "0.625rem", xl: "0.875rem" },
      transitions: { fast: "120ms ease-in-out", normal: "200ms ease-in-out", slow: "300ms ease-in-out" },
    },
  },
};

export function getTheme(id: ThemeId): ThemeConfig {
  return THEMES[id];
}

export function getAllThemes(): ThemeConfig[] {
  return Object.values(THEMES);
}
