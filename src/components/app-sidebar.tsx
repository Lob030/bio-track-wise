import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Rat, Bug, Boxes, Warehouse, Bell, ShoppingCart,
  Users, BarChart3, Sparkles, LogOut, Lock, ChevronDown, Settings, Download, CalendarDays, LayoutGrid
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useProfile, tierAllows, type Tier } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";

type Item = { title: string; url: string; icon: any; minTier?: Tier; children?: { title: string; url: string }[] };

const MENU: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  {
    title: "Roedores", url: "/rodents", icon: Rat,
    children: [
      { title: "Especies", url: "/rodents/species" },
      { title: "Líneas Genéticas", url: "/rodents/lines" },
      { title: "Cajas", url: "/rodents/boxes" },
      { title: "Lotes", url: "/rodents/lots" },
    ],
  },
  {
    title: "Insectos", url: "/insects", icon: Bug,
    children: [
      { title: "Especies", url: "/insects/species" },
      { title: "Líneas Genéticas", url: "/insects/lines" },
      { title: "Cajas", url: "/insects/boxes" },
      { title: "Lotes", url: "/insects/lots" },
    ],
  },
  { title: "Stock", url: "/stock", icon: Boxes, minTier: "gold" },
  { title: "Almacén", url: "/warehouse", icon: Warehouse, minTier: "gold" },
  { title: "Alertas", url: "/alerts", icon: Bell },
  { title: "Ventas", url: "/sales", icon: ShoppingCart, minTier: "gold" },
  { title: "Clientes", url: "/clients", icon: Users, minTier: "gold" },
  { title: "Reportes", url: "/reports", icon: BarChart3, minTier: "gold" },
  { title: "Calendario", url: "/calendar", icon: CalendarDays, minTier: "gold" },
  { title: "Kanban", url: "/kanban", icon: LayoutGrid, minTier: "silver" },
  { title: "Asistente IA", url: "/ai", icon: Sparkles, minTier: "gold" },
];

const sidebarStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  borderRight: "1px solid var(--color-surface-border)",
  color: "var(--color-text)",
};

const headerStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--color-surface-border)",
  padding: "1rem",
};

const groupLabelStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "0.7rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function getMenuBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.5rem",
    cursor: "pointer",
    transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
    backgroundColor: active
      ? `color-mix(in srgb, var(--color-primary) 15%, transparent)`
      : "transparent",
    color: active ? "var(--color-primary)" : "var(--color-text)",
    borderLeft: active ? "3px solid var(--color-primary)" : "3px solid transparent",
    fontWeight: active ? 600 : 400,
    boxShadow: active
      ? `inset 6px 0 12px -6px color-mix(in srgb, var(--color-primary) 20%, transparent)`
      : "none",
    fontFamily: "var(--font-family)",
  };
}

function getSubBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.375rem 0.75rem 0.375rem 1.5rem",
    borderRadius: "0.375rem",
    cursor: "pointer",
    transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
    backgroundColor: active
      ? `color-mix(in srgb, var(--color-primary) 12%, transparent)`
      : "transparent",
    color: active ? "var(--color-primary)" : "var(--color-text-muted)",
    fontSize: "0.875rem",
    fontWeight: active ? 500 : 400,
    fontFamily: "var(--font-family)",
    textDecoration: "none",
  };
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data: profile } = useProfile();
  const tier = (profile?.tier ?? "bronze") as Tier;

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const isActive = (url: string) => path === url || (url !== "/" && path.startsWith(url));

  const tierColor: Record<Tier, string> = {
    bronze: "bg-amber-700/30 text-amber-300 border-amber-700/50",
    silver: "bg-slate-500/30 text-slate-200 border-slate-500/50",
    gold: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    diamond: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  };

  return (
    <Sidebar collapsible="icon" style={sidebarStyle as any}>
      <SidebarHeader style={headerStyle}>
        <div className="flex items-center gap-2">
          <div
            className="h-9 w-9 rounded-xl grid place-items-center font-bold text-base shrink-0"
            style={{
              background: "var(--color-gradient, linear-gradient(135deg, var(--color-primary), var(--color-secondary)))",
              color: "var(--color-text-inverse)",
              boxShadow: "0 4px 12px color-mix(in srgb, var(--color-primary) 35%, transparent)",
            }}
          >
            B
          </div>
          {!collapsed && (
            <div>
              <div
                className="font-bold text-base tracking-tight"
                style={{ color: "var(--color-text)", fontFamily: "var(--font-family-heading)" }}
              >
                BioTrack
              </div>
              <Badge variant="outline" className={`mt-0.5 text-[10px] capitalize ${tierColor[tier]}`}>
                {tier}
              </Badge>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent
        className="sidebar-scroll"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <SidebarGroup>
          <SidebarGroupLabel style={groupLabelStyle}>Bioterio</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MENU.map((item) => {
                const allowed = !item.minTier || tierAllows(tier, item.minTier);
                if (item.children) {
                  return (
                    <Collapsible key={item.title} defaultOpen={isActive(item.url)} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <button
                            style={getMenuBtnStyle(isActive(item.url))}
                            className="w-full"
                            title={item.title}
                          >
                            <item.icon className="h-4 w-4 shrink-0" style={{ color: isActive(item.url) ? "var(--color-primary)" : "var(--color-text-muted)" }} />
                            {!collapsed && <span className="flex-1 text-left text-sm">{item.title}</span>}
                            {!collapsed && (
                              <ChevronDown
                                className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-180"
                                style={{ color: "var(--color-text-muted)" }}
                              />
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub style={{ borderLeft: "1px solid var(--color-surface-border)", marginLeft: "1rem" }}>
                            {item.children.map((c) => (
                              <SidebarMenuSubItem key={c.url}>
                                <Link to={c.url} style={getSubBtnStyle(isActive(c.url))}>
                                  {c.title}
                                </Link>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <Link to={item.url} style={getMenuBtnStyle(isActive(item.url))} className="w-full" title={item.title}>
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: isActive(item.url) ? "var(--color-primary)" : "var(--color-text-muted)" }}
                      />
                      {!collapsed && <span className="flex-1 text-sm">{item.title}</span>}
                      {!allowed && !collapsed && <Lock className="ml-auto h-3 w-3" style={{ color: "var(--color-text-muted)" }} />}
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter style={{ borderTop: "1px solid var(--color-surface-border)", padding: "0.5rem", backgroundColor: "var(--color-surface)" }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/settings" style={getMenuBtnStyle(isActive("/settings"))} className="w-full" title="Configuración">
              <Settings className="h-4 w-4 shrink-0" style={{ color: isActive("/settings") ? "var(--color-primary)" : "var(--color-text-muted)" }} />
              {!collapsed && <span className="text-sm">Configuración</span>}
            </Link>
          </SidebarMenuItem>
          {deferredPrompt && (
            <SidebarMenuItem>
              <button
                onClick={handleInstallClick}
                style={getMenuBtnStyle(false)}
                className="w-full text-emerald-400 hover:text-emerald-300 animate-pulse font-semibold"
                title="Instalar App"
              >
                <Download className="h-4 w-4 shrink-0 text-emerald-400" />
                {!collapsed && <span className="text-sm">Instalar App</span>}
              </button>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <button
              onClick={() => supabase.auth.signOut()}
              style={getMenuBtnStyle(false)}
              className="w-full"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} />
              {!collapsed && <span className="text-sm">Cerrar sesión</span>}
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
