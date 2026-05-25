import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Rat, Bug, Boxes, Warehouse, Bell, ShoppingCart,
  Users, BarChart3, Sparkles, LogOut, Lock, ChevronDown, Settings
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
  { title: "Asistente IA", url: "/ai", icon: Sparkles, minTier: "gold" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data: profile } = useProfile();
  const tier = (profile?.tier ?? "bronze") as Tier;

  const isActive = (url: string) => path === url || (url !== "/" && path.startsWith(url));

  const tierColor: Record<Tier, string> = {
    bronze: "bg-amber-700/30 text-amber-300 border-amber-700/50",
    silver: "bg-slate-500/30 text-slate-200 border-slate-500/50",
    gold: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    diamond: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-emerald grid place-items-center text-primary-foreground font-bold">
            B
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold text-base tracking-tight">BioTrack</div>
              <Badge variant="outline" className={`mt-0.5 text-[10px] capitalize ${tierColor[tier]}`}>
                {tier}
              </Badge>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="sidebar-scroll">
        <SidebarGroup>
          <SidebarGroupLabel>Bioterio</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MENU.map((item) => {
                const allowed = !item.minTier || tierAllows(tier, item.minTier);
                if (item.children) {
                  return (
                    <Collapsible key={item.title} defaultOpen={isActive(item.url)} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.title}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((c) => (
                              <SidebarMenuSubItem key={c.url}>
                                <SidebarMenuSubButton asChild isActive={isActive(c.url)}>
                                  <Link to={c.url}>{c.title}</Link>
                                </SidebarMenuSubButton>
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
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {!allowed && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Configuración">
              <Link to="/settings">
                <Settings className="h-4 w-4" />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => supabase.auth.signOut()} tooltip="Cerrar sesión">
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
