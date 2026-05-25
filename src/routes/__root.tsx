import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import "../styles/themes.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-3 text-muted-foreground">La página que buscas no existe.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >Reintentar</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BioTrack — Gestión de Bioterio" },
      { name: "description", content: "Plataforma profesional de gestión de bioterio: roedores, insectos, ventas, alertas y reportes." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
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
      <head><HeadContent /></head>
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, qc]);
  return null;
}

function AppShell() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="h-14 flex items-center gap-3 px-4 sticky top-0 z-30"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-surface) 80%, transparent)',
              borderBottom: '1px solid var(--color-surface-border)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <SidebarTrigger />
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>BioTrack · Gestión de Bioterio</div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer />
      <AuthBridge />
      <AuthOrApp />
      <Toaster />
    </QueryClientProvider>
  );
}

function AuthOrApp() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = router.state.location.pathname;
  // /login route handles its own layout
  if (path === "/login") return <Outlet />;
  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Cargando…</div>;
  }
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  return <AppShell />;
}
