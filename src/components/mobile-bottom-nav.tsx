import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ClipboardCheck, Home, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const items = [
  { label: "Inicio", to: "/" as const, icon: Home },
  { label: "Jornada", to: "/operations" as const, icon: ClipboardCheck },
  { label: "Alertas", to: "/alerts" as const, icon: Bell },
];

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className="flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
        onClick={() => setOpenMobile(true)}
      >
        <Menu className="h-5 w-5" />
        <span>Menú</span>
      </button>
    </nav>
  );
}
