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
      surface: "oklch(0.16 0.02 250)",
      primary: "oklch(0.65 0.17 180)",
      secondary: "oklch(0.55 0.15 190)",
      text: "oklch(0.97 0.01 250)",
      textMuted: "oklch(0.70 0.02 250)",
      border: "oklch(0.24 0.02 250)",
      error: "oklch(0.60 0.18 20)",
      success: "oklch(0.65 0.17 140)",
      warning: "oklch(0.75 0.15 75)",
    },
    typography: {
      family: "'Inter', sans-serif",
      headingFamily: "'Outfit', sans-serif",
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
    },
  },

  "light": {
    id: "light",
    name: "Claro Limpio",
    icon: "☀️",
    description: "Limpio, accesible, profesional",
    colors: {
      background: "oklch(0.99 0.005 240)",
      surface: "oklch(0.97 0.01 240)",
      primary: "oklch(0.55 0.20 250)",
      secondary: "oklch(0.60 0.15 200)",
      text: "oklch(0.20 0.02 240)",
      textMuted: "oklch(0.50 0.02 240)",
      border: "oklch(0.90 0.01 240)",
      error: "oklch(0.55 0.22 25)",
      success: "oklch(0.60 0.18 140)",
      warning: "oklch(0.70 0.18 70)",
    },
    typography: {
      family: "'Inter', sans-serif",
      headingFamily: "'Outfit', sans-serif",
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
      background: "oklch(0.10 0.03 270)",
      surface: "oklch(0.14 0.04 270)",
      primary: "oklch(0.65 0.30 330)",
      secondary: "oklch(0.75 0.20 190)",
      text: "oklch(0.95 0.05 190)",
      textMuted: "oklch(0.60 0.15 320)",
      border: "oklch(0.35 0.12 320)",
      error: "oklch(0.60 0.25 15)",
      success: "oklch(0.75 0.25 140)",
      warning: "oklch(0.80 0.20 90)",
    },
    typography: {
      family: "'Fira Code', monospace",
      headingFamily: "'Outfit', sans-serif",
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
      background: "oklch(0.14 0.025 140)",
      surface: "oklch(0.18 0.03 140)",
      primary: "oklch(0.72 0.15 130)",
      secondary: "oklch(0.78 0.13 100)",
      text: "oklch(0.95 0.01 140)",
      textMuted: "oklch(0.70 0.02 140)",
      border: "oklch(0.24 0.03 140)",
      error: "oklch(0.60 0.18 20)",
      success: "oklch(0.72 0.15 130)",
      warning: "oklch(0.78 0.15 80)",
    },
    typography: {
      family: "'Inter', sans-serif",
      headingFamily: "'Outfit', sans-serif",
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
      background: "oklch(0.11 0.025 230)",
      surface: "oklch(0.15 0.03 230)",
      primary: "oklch(0.68 0.16 210)",
      secondary: "oklch(0.62 0.14 240)",
      text: "oklch(0.95 0.015 230)",
      textMuted: "oklch(0.70 0.02 230)",
      border: "oklch(0.23 0.03 230)",
      error: "oklch(0.60 0.18 20)",
      success: "oklch(0.68 0.16 180)",
      warning: "oklch(0.75 0.15 75)",
    },
    typography: {
      family: "'Inter', sans-serif",
      headingFamily: "'Outfit', sans-serif",
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
      background: "oklch(0.13 0.025 40)",
      surface: "oklch(0.17 0.03 45)",
      primary: "oklch(0.70 0.20 40)",
      secondary: "oklch(0.78 0.18 70)",
      text: "oklch(0.96 0.02 50)",
      textMuted: "oklch(0.72 0.04 55)",
      border: "oklch(0.26 0.04 45)",
      error: "oklch(0.60 0.20 20)",
      success: "oklch(0.72 0.15 130)",
      warning: "oklch(0.78 0.18 70)",
    },
    typography: {
      family: "'Inter', sans-serif",
      headingFamily: "'Outfit', sans-serif",
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
      background: "oklch(0.18 0.015 250)",
      surface: "oklch(0.22 0.02 250)",
      primary: "oklch(0.78 0.08 220)",
      secondary: "oklch(0.70 0.06 240)",
      text: "oklch(0.96 0.005 250)",
      textMuted: "oklch(0.75 0.01 250)",
      border: "oklch(0.28 0.015 250)",
      error: "oklch(0.62 0.14 25)",
      success: "oklch(0.76 0.08 140)",
      warning: "oklch(0.80 0.08 85)",
    },
    typography: {
      family: "'Fira Code', monospace",
      headingFamily: "'Outfit', sans-serif",
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
