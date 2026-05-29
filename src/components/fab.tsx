import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, ShoppingCart, Rat, Bug, X } from "lucide-react";

const actions = [
  { label: "Nueva venta", icon: ShoppingCart, path: "/sales", query: "new=1" },
  { label: "Nuevo lote roedor", icon: Rat, path: "/rodents/lots", query: "new=1" },
  { label: "Nuevo lote insecto", icon: Bug, path: "/insects/lots", query: "new=1" },
];

export function FAB() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const go = (path: string, query: string) => {
    setOpen(false);
    navigate({ to: `${path}?${query}` });
  };

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-40 flex flex-col-reverse items-end gap-2">
      {/* Main FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-[52px] w-[52px] rounded-full bg-primary text-primary-foreground shadow-lg
                   hover:shadow-xl hover:scale-105 transition-all duration-200
                   grid place-items-center focus:outline-none focus:ring-2 focus:ring-primary/50"
        aria-label="Acciones rápidas"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>

      {/* Action items */}
      {actions.map((action, i) => (
        <button
          key={action.label}
          onClick={() => go(action.path, action.query)}
          className="flex items-center gap-2 rounded-full bg-card border border-border
                     px-4 py-2.5 shadow-md text-sm font-medium text-foreground
                     hover:bg-accent hover:border-primary/50 transition-all duration-200
                     focus:outline-none focus:ring-2 focus:ring-primary/50"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
            pointerEvents: open ? "auto" : "none",
            transitionDelay: open ? `${i * 50}ms` : "0ms",
          }}
        >
          <action.icon className="h-4 w-4 text-muted-foreground" />
          {action.label}
        </button>
      ))}
    </div>
  );
}
