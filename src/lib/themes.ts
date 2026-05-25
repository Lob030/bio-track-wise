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
    primary: string;
    secondary: string;
    text: string;
    textMuted: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };
  typography: {
    family: string;
    headingFamily?: string;
  };
  effects: {
    glow?: boolean;
    gradients?: boolean;
    glitch?: boolean;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  "dark-slate": {
    id: "dark-slate",
    name: "Slate Oscuro",
    icon: "🌙",
    description: "Profesional, high-tech, moderno",
    colors: {
      background: "oklch(0.12 0.015 250)",
      surface: "oklch(0.15 0.02 250)",
      primary: "oklch(0.55 0.15 160)",
      secondary: "oklch(0.45 0.15 160)",
      text: "oklch(0.95 0.02 250)",
      textMuted: "oklch(0.6 0.02 250)",
      border: "oklch(0.25 0.02 250)",
      error: "oklch(0.5 0.18 25)",
      success: "oklch(0.55 0.15 160)",
      warning: "oklch(0.7 0.15 70)",
    },
    typography: {
      family: "Inter, sans-serif",
      headingFamily: "Inter, sans-serif",
    },
    effects: {
      glow: false,
      gradients: false,
      glitch: false,
    },
  },

  "light": {
    id: "light",
    name: "Claro Limpio",
    icon: "☀️",
    description: "Limpio, accesible, profesional",
    colors: {
      background: "#ffffff",
      surface: "#f8fafc",
      primary: "#2563eb",
      secondary: "#3b82f6",
      text: "#1e293b",
      textMuted: "#64748b",
      border: "#e2e8f0",
      error: "#dc2626",
      success: "#22c55e",
      warning: "#f97316",
    },
    typography: {
      family: "Poppins, sans-serif",
      headingFamily: "Poppins, sans-serif",
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
    },
  },

  "cyberpunk": {
    id: "cyberpunk",
    name: "Cyberpunk Neón",
    icon: "⚡",
    description: "Futurista, atrevido, energético",
    colors: {
      background: "#0a0e27",
      surface: "#1a1f3a",
      primary: "#ff00ff",
      secondary: "#00ffff",
      text: "#00ffff",
      textMuted: "#ff00ff",
      border: "#ff00ff",
      error: "#ff0055",
      success: "#00ff00",
      warning: "#ffff00",
    },
    typography: {
      family: "Courier Prime, monospace",
      headingFamily: "Courier Prime, monospace",
    },
    effects: {
      glow: true,
      gradients: true,
      glitch: true,
    },
  },

  "forest": {
    id: "forest",
    name: "Bosque Natural",
    icon: "🌲",
    description: "Orgánico, natural, calmante",
    colors: {
      background: "#1a3a2a",
      surface: "#2d4a3a",
      primary: "#22c55e",
      secondary: "#84cc16",
      text: "#d4d4d4",
      textMuted: "#9ca3af",
      border: "#3a5a4a",
      error: "#f87171",
      success: "#22c55e",
      warning: "#b45309",
    },
    typography: {
      family: "Lora, serif",
      headingFamily: "Lora, serif",
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
    },
  },

  "ocean": {
    id: "ocean",
    name: "Océano Tranquilo",
    icon: "🌊",
    description: "Calmante, profesional, oceánico",
    colors: {
      background: "#0f172a",
      surface: "#1e3a5f",
      primary: "#0ea5e9",
      secondary: "#06b6d4",
      text: "#e0e7ff",
      textMuted: "#94a3b8",
      border: "#1e3a5f",
      error: "#f87171",
      success: "#06b6d4",
      warning: "#f59e0b",
    },
    typography: {
      family: "Raleway, sans-serif",
      headingFamily: "Raleway, sans-serif",
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
    },
  },

  "sunset": {
    id: "sunset",
    name: "Atardecer Cálido",
    icon: "🌅",
    description: "Cálido, acogedor, tropical",
    colors: {
      background: "#3d2817",
      surface: "#5a3a24",
      primary: "#fb923c",
      secondary: "#fbbf24",
      text: "#fef3c7",
      textMuted: "#d4a574",
      border: "#6a4a34",
      error: "#dc2626",
      success: "#fb923c",
      warning: "#fbbf24",
    },
    typography: {
      family: "Playfair Display, serif",
      headingFamily: "Playfair Display, serif",
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
    },
  },

  "nord": {
    id: "nord",
    name: "Ártico Nórdico",
    icon: "❄️",
    description: "Minimalista, escandinavo, frío",
    colors: {
      background: "#2e3440",
      surface: "#3b4252",
      primary: "#88c0d0",
      secondary: "#81a1c1",
      text: "#eceff4",
      textMuted: "#d0d0d0",
      border: "#434c5e",
      error: "#bf616a",
      success: "#a3be8c",
      warning: "#ebcb8b",
    },
    typography: {
      family: "Source Code Pro, monospace",
      headingFamily: "Source Code Pro, monospace",
    },
    effects: {
      glow: false,
      gradients: false,
      glitch: false,
    },
  },
};

export function getTheme(id: ThemeId): ThemeConfig {
  return THEMES[id];
}

export function getAllThemes(): ThemeConfig[] {
  return Object.values(THEMES);
}
