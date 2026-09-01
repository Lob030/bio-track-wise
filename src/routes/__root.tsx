import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import appCss from "../styles.css?url";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import { CommandPalette } from "@/components/command-palette";
import { FAB } from "@/components/fab";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { reportClientError } from "@/lib/monitoring";
import { Activity, Search, WifiOff } from "lucide-react";
import "../styles/themes.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-3 text-muted-foreground">La página que buscas no existe.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  reportClientError(error, "react-boundary");
  const raw = error?.message ?? "";
  let friendly = "Ocurrió un error inesperado. Por favor intenta de nuevo.";
  if (raw.startsWith("TIER_LIMIT:")) {
    friendly =
      "Has alcanzado el límite de tu plan actual. Actualiza tu suscripción para continuar.";
  } else if (raw.startsWith("Unauthorized")) {
    friendly = "Tu sesión expiró o no tienes permisos para esta acción.";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">{friendly}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BioTrack - Gestión de Bioterio" },
      {
        name: "description",
        content:
          "Plataforma profesional de gestión de bioterio: roedores, insectos, ventas, alertas y reportes.",
      },
      { property: "og:title", content: "BioTrack - Gestión de Bioterio" },
      { name: "twitter:title", content: "BioTrack - Gestión de Bioterio" },
      {
        property: "og:description",
        content:
          "Plataforma profesional de gestión de bioterio: roedores, insectos, ventas, alertas y reportes.",
      },
      {
        name: "twitter:description",
        content:
          "Plataforma profesional de gestión de bioterio: roedores, insectos, ventas, alertas y reportes.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/641fc5a2-ea5f-492a-a2c3-455e6b984131/id-preview-0b6fddec--2809650f-beff-48c5-944c-15bef42ced0e.lovable.app-1779845369784.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/641fc5a2-ea5f-492a-a2c3-455e6b984131/id-preview-0b6fddec--2809650f-beff-48c5-944c-15bef42ced0e.lovable.app-1779845369784.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&family=Lexend:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;900&family=Quicksand:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthBridge() {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);

  return null;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-destructive/10 text-destructive border-b border-destructive/20">
      <WifiOff className="h-4 w-4 shrink-0" />
      Sin conexión a internet. Los cambios no se guardarán hasta reconectarte.
    </div>
  );
}

function MobileSidebarCloser() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  return null;
}

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/rodents/species": "Especies de roedores",
  "/rodents/lines": "Líneas genéticas de roedores",
  "/rodents/boxes": "Cajas de roedores",
  "/rodents/lots": "Lotes de roedores",
  "/rodents/tree": "Árbol genético de roedores",
  "/insects/species": "Especies de insectos",
  "/insects/lines": "Líneas genéticas de insectos",
  "/insects/boxes": "Cajas de insectos",
  "/insects/lots": "Lotes de insectos",
  "/insects/tree": "Árbol genético de insectos",
  "/stock": "Stock",
  "/warehouse": "Almacén",
  "/operate": "Operar cajas",
  "/operations": "Centro operativo",
  "/costs": "Costos y rentabilidad",
  "/alerts": "Alertas",
  "/sales": "Ventas",
  "/clients": "Clientes",
  "/reports": "Reportes",
  "/reproduction": "Reproduccion",
  "/calendar": "Calendario",
  "/kanban": "Kanban",
  "/team": "Equipo",
  "/audit-log": "Bitácora operativa",
  "/settings": "Configuración",
  "/billing": "Planes",
};

function AppShell({ onCommandOpen }: { onCommandOpen: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const currentTitle = routeTitles[pathname] ?? "BioTrack";

  return (
    <SidebarProvider>
      <MobileSidebarCloser />
      <div
        className="premium-app-shell min-h-screen flex w-full"
        style={{ color: "var(--color-text)" }}
      >
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="premium-topbar h-16 flex items-center gap-3 px-3 sm:px-5 sticky top-0 z-30"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-surface) 80%, transparent)",
              borderBottom: "1px solid var(--color-surface-border)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-semibold truncate"
                style={{ color: "var(--color-text)" }}
              >
                {currentTitle}
              </div>
              <div
                className="hidden sm:block text-xs truncate"
                style={{ color: "var(--color-text-muted)" }}
              >
                BioTrack - Gestión de bioterio
              </div>
            </div>
            <button
              type="button"
              onClick={onCommandOpen}
              className="premium-icon-button"
              title="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
            <div className="hidden md:flex premium-status-pill">
              <Activity className="h-3.5 w-3.5" />
              <span>Operativo</span>
            </div>
          </header>
          <OfflineBanner />
          <main className="premium-main flex-1 overflow-auto pb-16 md:pb-0">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}

function ThemeInitializer() {
  useTheme();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer />
      <AuthBridge />
      <AuthOrApp onCommandOpen={() => setCmdOpen(true)} />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <Toaster />
    </QueryClientProvider>
  );
}

function AuthOrApp({ onCommandOpen }: { onCommandOpen: () => void }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = router.state.location.pathname;
  // /login and OAuth consent route handle their own layout/session flow
  if (path === "/login" || path.startsWith("/.lovable/oauth/consent")) return <Outlet />;
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        Cargando...
      </div>
    );
  }
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <>
      <AppShell onCommandOpen={onCommandOpen} />
      <FAB />
    </>
  );
}
