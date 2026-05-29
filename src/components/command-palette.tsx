import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Rat, Bug, Users, ShoppingCart } from "lucide-react";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

type LotResult = { id: string; lot_code: string | null; kind: string; lot_type: string };
type ClientResult = { id: string; name: string; email: string | null };
type OrderResult = { id: string; total_mxn: number };

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [lots, setLots] = useState<LotResult[]>([]);
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [orders, setOrders] = useState<OrderResult[]>([]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setLots([]);
      setClients([]);
      setOrders([]);
      return;
    }
    const pattern = `%${q.trim()}%`;

    const [lotsRes, clientsRes, ordersRes] = await Promise.all([
      supabase
        .from("lots")
        .select("id, lot_code, kind, lot_type")
        .or(`lot_code.ilike.${pattern},kind.ilike.${pattern},lot_type.ilike.${pattern}`)
        .limit(5),
      supabase
        .from("clients")
        .select("id, name, email")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(5),
      supabase
        .from("orders")
        .select("id, total_mxn")
        .or(`id.ilike.${pattern}`)
        .limit(5),
    ]);

    setLots(lotsRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setOrders(ordersRes.data ?? []);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setLots([]);
      setClients([]);
      setOrders([]);
    }
  }, [open]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate({ to: path });
  };

  const hasResults = lots.length > 0 || clients.length > 0 || orders.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar lotes, clientes, órdenes…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim() && !hasResults && (
          <CommandEmpty>Sin resultados para "{query}"</CommandEmpty>
        )}

        {lots.length > 0 && (
          <CommandGroup heading="Lotes">
            {lots.map((l) => (
              <CommandItem
                key={l.id}
                value={`lot-${l.id}`}
                onSelect={() =>
                  go(l.kind === "rodent" ? "/rodents/lots" : "/insects/lots")
                }
              >
                {l.kind === "rodent" ? (
                  <Rat className="mr-2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <Bug className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{l.lot_code ?? l.id.slice(0, 8)}</span>
                <span className="ml-2 text-xs text-muted-foreground capitalize">
                  {l.lot_type} · {l.kind === "rodent" ? "Roedor" : "Insecto"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {lots.length > 0 && clients.length > 0 && <CommandSeparator />}

        {clients.length > 0 && (
          <CommandGroup heading="Clientes">
            {clients.map((c) => (
              <CommandItem
                key={c.id}
                value={`client-${c.id}`}
                onSelect={() => go("/clients")}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                {c.email && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.email}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(lots.length > 0 || clients.length > 0) && orders.length > 0 && (
          <CommandSeparator />
        )}

        {orders.length > 0 && (
          <CommandGroup heading="Órdenes">
            {orders.map((o) => (
              <CommandItem
                key={o.id}
                value={`order-${o.id}`}
                onSelect={() => go("/sales")}
              >
                <ShoppingCart className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs">
                  #{o.id.slice(0, 8)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ${Number(o.total_mxn ?? 0).toLocaleString("es-MX")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
