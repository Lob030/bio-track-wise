# Plan — Rodents, Insects & Alerts modules

Replace all `ModuleStub` placeholders for Rodents (4 routes), Insects (4 routes), and Alerts (1 route) with fully interactive dark-mode UI wired to Supabase. Pure frontend work — schema already exists.

## 1. Shared building blocks

- `src/components/crud-page-shell.tsx` — reusable header (title, subtitle, action buttons) + card frame to keep all 8 CRUD pages visually consistent.
- `src/components/size-matrix-table.tsx` — renders a species `size_rules` JSONB as a clean table. Variants: `rodent` (Size / Days / Weight / Feed) and `insect` (Size / Days / Cantidad de individuos por 1 gramo).
- `src/lib/csv.ts` — tiny CSV import/export helpers (parse + download) for the Excel/CSV buttons on genetic lines and boxes.
- `src/hooks/use-supabase-list.ts` — thin wrapper around `useQuery` + realtime invalidation, used by every list view.

## 2. Rodents (2.2)

### 2.2.1 `/rodents/species`
- Table of species (kind=rodent) with row-expand showing the `size_matrix-table` view.
- `+ Nueva especie` modal: name + dynamic size-rule rows (label, min_days, max_days, min_weight_g, max_weight_g, daily_feed_g).
- Seed action button "Cargar preset Rata Long Evans" → inserts species with rules:
  - Pinky 0-6d, 0-16g, 0g/day
  - Fuzzy 7-14d, 16-30g, 0g/day
  - Jumper 15-21d, 30-50g, 4g/day

### 2.2.2 `/rodents/lines`
- Grid of cards, one per genetic line, grouped by species.
- `+ Nueva línea` modal: Name*, Species selector (rodent species only)*, Date*, Origin, Notes. Saved into `genetic_lines` (origin/date stored in `notes` field as JSON since schema has only name/species_id/notes — keep it simple and prepend metadata into notes).
- Toolbar: Importar CSV / Exportar CSV.

### 2.2.3 `/rodents/boxes`
- Grid of box cards. Fields: code*, location (room/rack)*, usage (engorda/reproductores)* — usage stored in `location` as suffix or in a new column? Use existing schema: store usage in `location` as `"Room/Rack · Engorda"` to avoid migration. Capacity optional.
- Live tags: query `lots` joined by `box_id`; show "Ocupada" (amber) when ≥1 active lot, "Libre" (emerald) otherwise.
- Computed feed consumption: sum across assigned active lots of `(males+females+unsexed) × daily_feed_g` (using species size rule for current age). Displayed at the bottom of each card.

### 2.2.4 `/rodents/lots`
- Existing page kept; extend the New Lot modal with species/line/box selectors and clearer Total = M+H+S/S display. Wire reactive invalidation.

## 3. Insects (2.3)

### 2.3.1 `/insects/species`
- Same shell as rodents species, but `size_matrix-table` insect variant.
- Seed button "Cargar preset Tenebrios":
  - Huevo 0-14d → 50000 / g
  - 1 Semana 15-21d → 6000 / g
  - 2 Semana 22-28d → 800 / g
  - 3 Semana 29-35d → 200 / g

### 2.3.2 `/insects/lines` & 2.3.3 `/insects/boxes`
- Same components as rodent equivalents, filtered to `kind=insect`. CSV import/export included.

### 2.3.4 `/insects/lots`
- Table + 3 summary cards (Lotes activos, Biomasa total g, Lotes finalizados mes).
- `+ Nuevo lote` modal: code, species, line, box, lot_type, **Peso en gramos del lote*** (required `mass_grams`), parent_lot_id optional, notes. No M/H/S/S fields.

## 4. Alerts (2.4) — `/alerts`

- Layout: left column = list of existing rules + active alerts feed, right column = sticky live-preview card.
- `+ Nueva Regla de Alerta` modal — sentence builder rendered as a flex-wrap of inline pill controls:

  `SI [scope ▾] de tipo [lot_type ▾] cumple [metric ▾] [operator ▾] [threshold #] ENTONCES generar alerta con prioridad [priority ▾] y frecuencia [frequency ▾]`

  - scope: "Todos los lotes" | "Lote específico" (when selected, lot_id dropdown appears)
  - lot_type: birth / engorda / breeder
  - metric: age_days / days_active / weight
  - operator: > < =
  - threshold: number input
  - priority: high (red) / medium (amber)
  - frequency: once (0) / recurrent X days (number input)

- Live preview panel renders the resulting banner exactly as it appears on the Dashboard: colored dot, interpolated template `Lote {lot_id} en caja {box_id} alcanzó {metric} {operator} {threshold}`, priority badge, frequency footnote.
- On save → insert into `alert_rules`. List shows toggle (enabled), edit, delete.
- Active alerts feed: live `alerts` table with acknowledge button.

## Technical notes

- All data via `supabase` browser client + TanStack Query; optimistic invalidations on every mutation.
- All forms use Zod validation with toast errors (re-using existing sonner).
- Strict semantic tokens — no hard-coded colors; emerald = ok/libre, amber = warning/ocupada, red = high alert.
- No schema migrations — everything fits current tables. Origin/date for genetic lines and usage for boxes are folded into existing text columns to avoid migration.
- ~13 files touched: 9 route files rewritten, 3 new shared components, 1 CSV util.

Ready to implement on approval.
