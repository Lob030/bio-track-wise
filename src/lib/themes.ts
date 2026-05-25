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
    name: "Midnight Pro",
    icon: "🌙",
    description: "Sofisticado, premium, profesional",
    colors: {
      background: "#0a0f1e",
      surface: "#151b2e",
      surfaceHover: "#1e2740",
      surfaceBorder: "#2d3650",
      text: "#f8fafc",
      textMuted: "#94a3b8",
      textInverse: "#0a0f1e",
      primary: "#14b8a6",
      primaryHover: "#0d9488",
      secondary: "#06b6d4",
      accent: "#10b981",
      accentSecondary: "#3b82f6",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#3b82f6",
      overlay: "rgba(10, 15, 30, 0.95)",
      gradient: "linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)",
    },
    typography: {
      family: "'DM Sans', -apple-system, system-ui, sans-serif",
      headingFamily: "'Space Grotesk', 'DM Sans', sans-serif",
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
        "2xl": "1.625rem",
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "-0.025em",
        normal: "-0.01em",
        wide: "0.01em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0, 0, 0, 0.3)",
        md: "0 4px 6px rgba(0, 0, 0, 0.4)",
        lg: "0 10px 15px rgba(0, 0, 0, 0.5)",
        xl: "0 20px 25px rgba(0, 0, 0, 0.6)",
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
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
    name: "Crystal Clear",
    icon: "☀️",
    description: "Limpio, moderno, minimalista",
    colors: {
      background: "#ffffff",
      surface: "#f8f9fa",
      surfaceHover: "#f1f3f5",
      surfaceBorder: "#dee2e6",
      text: "#212529",
      textMuted: "#6c757d",
      textInverse: "#ffffff",
      primary: "#4f46e5",
      primaryHover: "#4338ca",
      secondary: "#6366f1",
      accent: "#8b5cf6",
      accentSecondary: "#06b6d4",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#3b82f6",
      overlay: "rgba(33, 37, 41, 0.75)",
      gradient: "linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%)",
    },
    typography: {
      family: "'Inter Tight', 'Inter', system-ui, sans-serif",
      headingFamily: "'Sora', 'Inter Tight', sans-serif",
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
        "2xl": "1.625rem",
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0em",
        wide: "0.015em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px rgba(0, 0, 0, 0.08)",
        lg: "0 10px 15px rgba(0, 0, 0, 0.1)",
        xl: "0 20px 25px rgba(0, 0, 0, 0.15)",
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
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
    name: "Neon City",
    icon: "⚡",
    description: "Futurista, vibrante, electrizante",
    colors: {
      background: "#0d0221",
      surface: "#1a0f3a",
      surfaceHover: "#2a1a54",
      surfaceBorder: "#3d2b6b",
      text: "#f0f4ff",
      textMuted: "#c4b5fd",
      textInverse: "#0d0221",
      primary: "#a855f7",
      primaryHover: "#9333ea",
      secondary: "#ec4899",
      accent: "#06b6d4",
      accentSecondary: "#10b981",
      success: "#10b981",
      warning: "#fbbf24",
      error: "#f43f5e",
      info: "#06b6d4",
      overlay: "rgba(13, 2, 33, 0.95)",
      gradient: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    },
    typography: {
      family: "'JetBrains Mono', 'Fira Code', monospace",
      headingFamily: "'Orbitron', 'JetBrains Mono', monospace",
      weights: {
        light: 400,
        regular: 500,
        medium: 600,
        semibold: 700,
        bold: 800,
      },
      sizes: {
        xs: "0.75rem",
        sm: "0.875rem",
        base: "0.9375rem",
        lg: "1.0625rem",
        xl: "1.1875rem",
        "2xl": "1.5rem",
      },
      lineHeight: {
        tight: 1.3,
        normal: 1.6,
        relaxed: 1.8,
      },
      letterSpacing: {
        tight: "0em",
        normal: "0.02em",
        wide: "0.05em",
      },
    },
    effects: {
      glow: true,
      gradients: true,
      glitch: true,
      shadows: {
        sm: "0 0 8px rgba(168, 85, 247, 0.3)",
        md: "0 0 16px rgba(168, 85, 247, 0.4)",
        lg: "0 0 24px rgba(168, 85, 247, 0.5)",
        xl: "0 0 40px rgba(168, 85, 247, 0.6)",
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
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
    name: "Deep Forest",
    icon: "🌲",
    description: "Natural, sereno, orgánico",
    colors: {
      background: "#0c1a12",
      surface: "#162822",
      surfaceHover: "#1e3a2f",
      surfaceBorder: "#2d5444",
      text: "#f0fdf4",
      textMuted: "#bbf7d0",
      textInverse: "#0c1a12",
      primary: "#22c55e",
      primaryHover: "#16a34a",
      secondary: "#4ade80",
      accent: "#84cc16",
      accentSecondary: "#eab308",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#06b6d4",
      overlay: "rgba(12, 26, 18, 0.9)",
      gradient: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)",
    },
    typography: {
      family: "'Quicksand', 'Nunito', sans-serif",
      headingFamily: "'Comfortaa', 'Quicksand', sans-serif",
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
        "2xl": "1.625rem",
      },
      lineHeight: {
        tight: 1.3,
        normal: 1.6,
        relaxed: 1.9,
      },
      letterSpacing: {
        tight: "0em",
        normal: "0.01em",
        wide: "0.025em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 4px rgba(0, 0, 0, 0.2)",
        md: "0 4px 8px rgba(0, 0, 0, 0.25)",
        lg: "0 8px 16px rgba(0, 0, 0, 0.3)",
        xl: "0 12px 24px rgba(0, 0, 0, 0.35)",
      },
      borderRadius: {
        sm: "0.625rem",
        md: "0.875rem",
        lg: "1.125rem",
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
    name: "Deep Ocean",
    icon: "🌊",
    description: "Profundo, tranquilo, profesional",
    colors: {
      background: "#05131d",
      surface: "#0f2334",
      surfaceHover: "#1a3548",
      surfaceBorder: "#244b63",
      text: "#f0f9ff",
      textMuted: "#bae6fd",
      textInverse: "#05131d",
      primary: "#0ea5e9",
      primaryHover: "#0284c7",
      secondary: "#06b6d4",
      accent: "#3b82f6",
      accentSecondary: "#6366f1",
      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#06b6d4",
      overlay: "rgba(5, 19, 29, 0.9)",
      gradient: "linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)",
    },
    typography: {
      family: "'Manrope', 'Open Sans', sans-serif",
      headingFamily: "'Outfit', 'Manrope', sans-serif",
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
        "2xl": "1.625rem",
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.6,
        relaxed: 1.8,
      },
      letterSpacing: {
        tight: "-0.015em",
        normal: "0em",
        wide: "0.015em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 6px rgba(0, 0, 0, 0.15)",
        md: "0 4px 12px rgba(0, 0, 0, 0.2)",
        lg: "0 8px 24px rgba(0, 0, 0, 0.25)",
        xl: "0 16px 40px rgba(0, 0, 0, 0.3)",
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
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
    name: "Golden Hour",
    icon: "🌅",
    description: "Cálido, elegante, acogedor",
    colors: {
      background: "#1a0e08",
      surface: "#2d1a10",
      surfaceHover: "#3f291a",
      surfaceBorder: "#57382a",
      text: "#fef3e2",
      textMuted: "#fde68a",
      textInverse: "#1a0e08",
      primary: "#f59e0b",
      primaryHover: "#d97706",
      secondary: "#fb923c",
      accent: "#fbbf24",
      accentSecondary: "#ef4444",
      success: "#10b981",
      warning: "#fbbf24",
      error: "#ef4444",
      info: "#3b82f6",
      overlay: "rgba(26, 14, 8, 0.95)",
      gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    },
    typography: {
      family: "'Lexend', 'Plus Jakarta Sans', sans-serif",
      headingFamily: "'Playfair Display', 'Lexend', serif",
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
        "2xl": "1.625rem",
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.6,
        relaxed: 1.8,
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0em",
        wide: "0.02em",
      },
    },
    effects: {
      glow: false,
      gradients: true,
      glitch: false,
      shadows: {
        sm: "0 2px 4px rgba(0, 0, 0, 0.25)",
        md: "0 6px 12px rgba(0, 0, 0, 0.3)",
        lg: "0 12px 24px rgba(0, 0, 0, 0.35)",
        xl: "0 20px 40px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: {
        sm: "0.625rem",
        md: "0.875rem",
        lg: "1.125rem",
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
    name: "Arctic Frost",
    icon: "❄️",
    description: "Minimalista, fresco, nórdico",
    colors: {
      background: "#2e3440",
      surface: "#3b4252",
      surfaceHover: "#434c5e",
      surfaceBorder: "#4c566a",
      text: "#eceff4",
      textMuted: "#d8dee9",
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
      overlay: "rgba(46, 52, 64, 0.95)",
      gradient: "linear-gradient(135deg, #88c0d0 0%, #81a1c1 100%)",
    },
    typography: {
      family: "'IBM Plex Sans', 'Roboto', sans-serif",
      headingFamily: "'IBM Plex Sans', sans-serif",
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
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
      letterSpacing: {
        tight: "-0.01em",
        normal: "0em",
        wide: "0.02em",
      },
    },
    effects: {
      glow: false,
      gradients: false,
      glitch: false,
      shadows: {
        sm: "0 1px 3px rgba(0, 0, 0, 0.15)",
        md: "0 3px 6px rgba(0, 0, 0, 0.2)",
        lg: "0 6px 12px rgba(0, 0, 0, 0.25)",
        xl: "0 12px 24px rgba(0, 0, 0, 0.3)",
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
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
