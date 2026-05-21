
# BioTrack — Build Plan

A premium dark-mode bioterium management app (Slate-900/950, emerald/amber/red accents) built on TanStack Start + Tailwind + Lovable Cloud (Supabase). Spanish UI labels preserved per spec.

## 1. Foundation

- Enable **Lovable Cloud** (Supabase) and **Lovable AI Gateway**.
- Design system in `src/styles.css`: slate-950 bg, slate-900 panels, slate-800 borders, emerald (finance), amber (medium alerts), red (high alerts), violet (AI). Inter + JetBrains Mono pair.
- Sidebar shell in `__root.tsx` with collapsible groups, persistent across routes.
- Auth: email/password + Google via Lovable broker.

## 2. Database Schema (Supabase migrations)

Core tables (all RLS enabled, scoped by `owner_id = auth.uid()`):

- `profiles` — id, email, full_name, **tier** enum (`bronze|silver|gold|diamond`), tier_renewed_at, ai_prompts_used_this_month
- `user_roles` + `has_role()` security-definer fn (admin support)
- `species` — kind enum (`rodent|insect`), name, **size_rules jsonb** (rodent: day ranges; insect: individuals_per_gram by week)
- `genetic_lines` — species_id, name, notes
- `boxes` — kind, code, capacity, location; computed `is_occupied` via view
- `lots` — kind, species_id, line_id, box_id, **type** (`breeder|engorda|birth`), status (`active|finalizado`), males/females/unsexed (rodents), mass_grams (insects), started_at, parent_lot_id (for insect splits), provider_purchase_id
- `alert_rules` — scope, lot_id?, lot_type, metric, operator, threshold, priority, frequency_days, last_triggered_at, template_text
- `alerts` — rule_id, lot_id, message, priority, status, created_at
- `warehouse_food`, `warehouse_cleaning` (expiry_date), `warehouse_tools` (condition), `warehouse_packaging`, `warehouse_purchases` (invoice_id, species, line, population, total_cost, converted_to_lot_id)
- `clients` — name, phone, profile enum
- `orders` — client_id, status (`preparando|historial`), discount_pct, total_mxn, created_at, delivered_at
- `order_items` — order_id, species_id, size_label, requested_units/grams, unit_price
- `order_item_allocations` — item_id, lot_id, units_or_grams_taken (FIFO audit)
- `ai_conversations`, `ai_messages`, `ai_pending_actions` (proposal payload + status)

Triggers/functions:
- `enforce_tier_limits()` BEFORE INSERT on `lots` and `clients`.
- `compute_lot_size(lot_id)` returns current size category from species rules + days alive.
- `fifo_consume(species_id, size, qty)` — selects active lots matching size ordered by population ASC, deducts, marks `finalizado` when emptied, returns allocation rows.
- `increment_ai_prompt_count()`.

## 3. Tier Enforcement

- Server-side: triggers + RLS + a `requireTier(min)` server-fn middleware.
- Client-side: `useTier()` hook + `<TierGate min="silver" />` wrapper that hides/locks routes and shows upgrade card. Sidebar items render with lock icons for blocked tiers.

## 4. Modules / Routes

```
/                       Dashboard (8 KPI cards, recent lots, demographic bars)
/rodents/{species|lines|boxes|lots}
/insects/{species|lines|boxes|lots}
/stock                  Toggle Roedores/Insectos
/warehouse              5 tabs (Alimento, Limpieza, Herramientas, Entregas, Ejemplares)
/alerts                 Rules list + builder modal + active alerts feed
/sales                  Preparando + Historial pipeline + new sale form
/clients
/reports                Tabbed standard + specialized analytics
/ai                     Chat workspace with proposal-card confirmation loop
/settings/billing       Tier management
/login
```

Layout routes under `_authenticated/` so middleware gates everything.

## 5. Key UX Specs

- **Alert builder**: "Complete the sentence" inline-token UI; live preview banner card; template parser for `{lot_id}`, `{box_id}`.
- **Warehouse → Ejemplares**: on save, modal "¿Inicializar como lote ahora?" → deep-link `/rodents/lots/new?prefill=<purchase_id>` (or insects).
- **Sales form**: cascading selectors Species → Size → Units/Grams, discount dropdown. On submit, server-fn runs `fifo_consume` atomically and shows allocation breakdown toast.
- **Stock view**: reactive toggle; rodent grid cards (live counts by species in birth/engorda within age window) vs. insect mass table (grams per chronological week).
- **AI Assistant**: streaming chat via `/api/chat`. When model returns a tool-call (structured `propose_mutation`), persist to `ai_pending_actions` and render a Proposal Card with schema diff + Confirm/Cancel buttons. No DB writes until confirmed.

## 6. Reports

- Recharts: line/bar for profits, orders, clients by Day/Week/Month/Year.
- Rodent breeder performance grid: box code × live offspring count from birth lots linked to that box.
- Insect breeder performance: count of derived engorda sub-lots per parent.
- Sales pie by client profile.
- Feed efficiency: cost entries vs. biomass growth bar.
- Gold tier blocked from "Advanced Reports" sub-tab.

## 7. Technical Notes

- TanStack Start `createServerFn` for all mutations (no Edge Functions).
- `requireSupabaseAuth` middleware on every protected fn; `attachSupabaseAuth` in `src/start.ts`.
- TanStack Query for caching; optimistic updates on lot count changes, sales pipeline moves.
- Supabase realtime subscription on `alerts` and `orders` tables for instant UI updates.
- All numeric inputs validated with Zod (min/max bounds).

## 8. Build Order

1. Cloud + AI Gateway enable, schema migration, RLS, triggers
2. Auth + sidebar shell + tier hook
3. Rodents/Insects (species, lines, boxes, lots) CRUD
4. Dashboard KPIs
5. Warehouse 5 tabs + purchase→lot deep link
6. Clients
7. Alerts engine + builder
8. Sales + FIFO algorithm
9. Stock view
10. Reports
11. AI Assistant with proposal-card loop
12. Tier gating polish + upgrade screens

Ready to start when you approve.
