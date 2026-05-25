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
    weights: {
      light: number;
      regular: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    sizes: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      "2xl": string;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
    letterSpacing: {
      tight: string;
      normal: string;
      wide: string;
    };
  };
  effects: {
    glow?: boolean;
    gradients?: boolean;
    glitch?: boolean;
    shadows: {
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
    borderRadius: {
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
    transitions: {
      fast: string;
      normal: string;
      slow: string;
    };
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  "dark-slate": {
    id: "dark-slate",
    name: "Slate Oscuro",
    icon: "🌙",
    description: "Profesional, high-tech, moderno",
    colors: {
      background: "oklch(0.10 0.01 250)",
      surface: "oklch(0.14 0.015 250)",
      surfaceHover: "oklch(0.18 0.02 250)",
      surfaceBorder: "oklch(0.22 0.02 250)",
      text: "oklch(0.95 0.02 250)",
      textMuted: "oklch(0.70 0.02 250)",
      textInverse: "oklch(0.10 0.01 250)",
      primary: "oklch(0.58 0.15 155)",
      primaryHover: "oklch(0.65 0.15 155)",
      secondary: "oklch(0.50 0.12 250)",
      accent: "oklch(0.60 0.15 160)",
      accentSecondary: "oklch(0.65 0.14 180)",
      success: "oklch(0.60 0.15 155)",
      warning: "oklch(0.70 0.15 60)",
      error: "oklch(0.55 0.20 25)",
      info: "oklch(0.60 0.15 250)",
      overlay: "oklch(0.05 0.01 250)",
      gradient: "linear-gradient(135deg, oklch(0.58 0.15 155) 0%, oklch(0.50 0.12 250) 100%)",
    },
    typography: {
      family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      headingFamily: "Inter, sans-serif",
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0em",
        wide: "0.025em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px rgba(0, 0, 0, 0.1)",
        lg: "0 10px 15px rgba(0, 0, 0, 0.2)",
        xl: "0 20px 25px rgba(0, 0, 0, 0.3)",
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      transitions: {
        fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
        normal: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
        slow: "350ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },

  "light": {
    id: "light",
    name: "Claro Limpio",
    icon: "☀️",
    description: "Minimalista, limpio, accesible",
    colors: {
      background: "#ffffff",
      surface: "#f8fafc",
      surfaceHover: "#f1f5f9",
      surfaceBorder: "#e2e8f0",
      text: "#0f172a",
      textMuted: "#475569",
      textInverse: "#ffffff",
      primary: "#2563eb",
      primaryHover: "#1d4ed8",
      secondary: "#3b82f6",
      accent: "#1e40af",
      accentSecondary: "#0284c7",
      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
      info: "#0284c7",
      overlay: "rgba(15, 23, 42, 0.7)",
      gradient: "linear-gradient(135deg, #2563eb 0%, #0284c7 100%)",
    },
    typography: {
      family: "Poppins, -apple-system, BlinkMacSystemFont, sans-serif",
      headingFamily: "Poppins, sans-serif",
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0em",
        wide: "0.025em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px rgba(0, 0, 0, 0.07)",
        lg: "0 10px 15px rgba(0, 0, 0, 0.1)",
        xl: "0 20px 25px rgba(0, 0, 0, 0.15)",
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      transitions: {
        fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
        normal: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
        slow: "350ms cubic-bezier(0.4, 0, 0.2, 1)",
      },
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
      surfaceHover: "#242b48",
      surfaceBorder: "#3d4a6b",
      text: "#00ffff",
      textMuted: "#88ccff",
      textInverse: "#0a0e27",
      primary: "#ff00ff",
      primaryHover: "#ff33ff",
      secondary: "#00ffff",
      accent: "#ff00ff",
      accentSecondary: "#00ff00",
      success: "#00ff00",
      warning: "#ffff00",
      error: "#ff0055",
      info: "#00ffff",
      overlay: "rgba(10, 14, 39, 0.9)",
      gradient: "linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)",
    },
    typography: {
      family: "Courier Prime, monospace",
      headingFamily: "Space Mono, monospace",
      weights: {
        light: 400,
        regular: 400,
        medium: 700,
        semibold: 700,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.1,
        normal: 1.4,
        relaxed: 1.6,
      },
      letterSpacing: {
        tight: "0.02em",
        normal: "0.05em",
        wide: "0.1em",
      },
    },
    effects: {
      glow: true,
      gradients: true,
      glitch: true,
      shadows: {
        sm: "0 0 10px rgba(255, 0, 255, 0.3)",
        md: "0 0 20px rgba(255, 0, 255, 0.5)",
        lg: "0 0 30px rgba(0, 255, 255, 0.5)",
        xl: "0 0 50px rgba(255, 0, 255, 0.6)",
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      transitions: {
        fast: "100ms linear",
        normal: "200ms linear",
        slow: "300ms linear",
      },
    },
  },

  "forest": {
    id: "forest",
    name: "Bosque Natural",
    icon: "🌲",
    description: "Orgánico, natural, calmante",
    colors: {
      background: "#0f2b1f",
      surface: "#1a3d2d",
      surfaceHover: "#244d38",
      surfaceBorder: "#2d5f45",
      text: "#e8f5e9",
      textMuted: "#a8d5ba",
      textInverse: "#0f2b1f",
      primary: "#4ade80",
      primaryHover: "#22c55e",
      secondary: "#86efac",
      accent: "#22c55e",
      accentSecondary: "#84cc16",
      success: "#22c55e",
      warning: "#b45309",
      error: "#ef4444",
      info: "#06b6d4",
      overlay: "rgba(15, 43, 31, 0.8)",
      gradient: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)",
    },
    typography: {
      family: "Lora, Georgia, serif",
      headingFamily: "Lora, serif",
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.3,
        normal: 1.6,
        relaxed: 1.9,
      },
      letterSpacing: {
        tight: "-0.01em",
        normal: "0em",
        wide: "0.02em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 4px rgba(0, 0, 0, 0.1)",
        md: "0 4px 8px rgba(0, 0, 0, 0.15)",
        lg: "0 8px 16px rgba(0, 0, 0, 0.2)",
        xl: "0 12px 24px rgba(0, 0, 0, 0.25)",
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      transitions: {
        fast: "200ms ease-out",
        normal: "300ms ease-out",
        slow: "500ms ease-out",
      },
    },
  },

  "ocean": {
    id: "ocean",
    name: "Océano Tranquilo",
    icon: "🌊",
    description: "Calmante, profesional, oceánico",
    colors: {
      background: "#0c1929",
      surface: "#132d4a",
      surfaceHover: "#1a3d5f",
      surfaceBorder: "#1f4969",
      text: "#e0f2fe",
      textMuted: "#7dd3fc",
      textInverse: "#0c1929",
      primary: "#0284c7",
      primaryHover: "#0369a1",
      secondary: "#0ea5e9",
      accent: "#06b6d4",
      accentSecondary: "#00d9ff",
      success: "#06b6d4",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#0284c7",
      overlay: "rgba(12, 25, 41, 0.85)",
      gradient: "linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)",
    },
    typography: {
      family: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      headingFamily: "Raleway, sans-serif",
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.8,
      },
      letterSpacing: {
        tight: "-0.01em",
        normal: "0em",
        wide: "0.015em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 6px rgba(0, 0, 0, 0.12)",
        md: "0 4px 12px rgba(0, 0, 0, 0.15)",
        lg: "0 8px 24px rgba(0, 0, 0, 0.2)",
        xl: "0 16px 40px rgba(0, 0, 0, 0.25)",
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      transitions: {
        fast: "200ms cubic-bezier(0.4, 0, 1, 1)",
        normal: "300ms cubic-bezier(0.4, 0, 1, 1)",
        slow: "500ms cubic-bezier(0.4, 0, 1, 1)",
      },
    },
  },

  "sunset": {
    id: "sunset",
    name: "Atardecer Cálido",
    icon: "🌅",
    description: "Cálido, acogedor, tropical",
    colors: {
      background: "#2a1810",
      surface: "#3d2817",
      surfaceHover: "#4d3622",
      surfaceBorder: "#5d4628",
      text: "#fef3c7",
      textMuted: "#f5d5a8",
      textInverse: "#2a1810",
      primary: "#f97316",
      primaryHover: "#ea580c",
      secondary: "#fb923c",
      accent: "#fbbf24",
      accentSecondary: "#facc15",
      success: "#fb923c",
      warning: "#fbbf24",
      error: "#dc2626",
      info: "#0284c7",
      overlay: "rgba(42, 24, 16, 0.9)",
      gradient: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
    },
    typography: {
      family: "Playfair Display, Georgia, serif",
      headingFamily: "Playfair Display, serif",
      weights: {
        light: 400,
        regular: 400,
        medium: 500,
        semibold: 700,
        bold: 900,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.8,
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "-0.01em",
        wide: "0.01em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 4px rgba(0, 0, 0, 0.2)",
        md: "0 6px 12px rgba(0, 0, 0, 0.25)",
        lg: "0 12px 24px rgba(0, 0, 0, 0.3)",
        xl: "0 20px 40px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      transitions: {
        fast: "250ms ease-out",
        normal: "350ms ease-out",
        slow: "600ms ease-out",
      },
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
      surfaceHover: "#434c5e",
      surfaceBorder: "#4c566a",
      text: "#eceff4",
      textMuted: "#d0d0d0",
      textInverse: "#2e3440",
      primary: "#88c0d0",
      primaryHover: "#81a1c1",
      secondary: "#81a1c1",
      accent: "#a3be8c",
      accentSecondary: "#b48ead",
      success: "#a3be8c",
      warning: "#ebcb8b",
      error: "#bf616a",
      info: "#88c0d0",
      overlay: "rgba(46, 52, 64, 0.9)",
      gradient: "linear-gradient(135deg, #88c0d0 0%, #81a1c1 100%)",
    },
    typography: {
      family: "Source Code Pro, Menlo, monospace",
      headingFamily: "Source Code Pro, monospace",
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "0em",
        normal: "0.01em",
        wide: "0.025em",
      },
    },
    effects: {
      glow: false,
      gradients: false,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0, 0, 0, 0.12)",
        md: "0 3px 6px rgba(0, 0, 0, 0.15)",
        lg: "0 6px 12px rgba(0, 0, 0, 0.18)",
        xl: "0 12px 24px rgba(0, 0, 0, 0.2)",
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      transitions: {
        fast: "100ms ease-in-out",
        normal: "200ms ease-in-out",
        slow: "300ms ease-in-out",
      },
    },
  },
};

export function getTheme(id: ThemeId): ThemeConfig {
  return THEMES[id];
}

export function getAllThemes(): ThemeConfig[] {
  return Object.values(THEMES);
}
