## Diagnóstico

Hoy hay **dos sistemas de color peleándose**:

1. `src/styles.css` + componentes shadcn → tokens `--background`, `--card`, `--border`, `--primary`, `--muted-foreground`, etc.
2. `src/styles/themes.css` + `use-theme.ts` → variables `--color-background`, `--color-surface`, `--color-primary`, etc.

Cuando cambias de tema, **solo** se actualizan las `--color-*`, pero los componentes shadcn siguen leyendo los tokens originales. Resultado: tarjetas con `bg-card` que no se sincronizan, `text-emerald-400` hardcoded que pierde contraste sobre fondos claros u oscuros saturados, botones de acción `variant="ghost"` con `text-[9px]` que desaparecen, y selectores globales agresivos como `[class*="card"]` en `themes.css` que pisan estilos de shadcn de forma impredecible.

## Objetivo

Sistema de diseño **único y coherente** que se vea nivel Linear/Vercel/Stripe en los 7 temas, con contraste AA garantizado, jerarquía clara y botones de acción siempre legibles.

## Cambios

### 1. Unificar el sistema de tokens (raíz del problema)

- En `use-theme.ts → applyTheme()`, además de las `--color-*`, **mapear cada tema a los tokens shadcn** que ya usan los componentes:
  - `--background`, `--foreground`
  - `--card`, `--card-foreground`
  - `--popover`, `--popover-foreground`
  - `--primary`, `--primary-foreground`
  - `--secondary`, `--secondary-foreground`
  - `--muted`, `--muted-foreground`
  - `--accent`, `--accent-foreground`
  - `--destructive`, `--destructive-foreground`
  - `--border`, `--input`, `--ring`
  - `--sidebar-*` (la sidebar usa su propio set)
- Así un solo cambio de tema mueve **toda** la UI.

### 2. Limpiar `src/styles/themes.css`

- Eliminar los selectores globales agresivos (`[class*="card"]`, `button:not([variant=...])`, `input`, `textarea`, etc.) que pisan shadcn.
- Mantener solo: reset tipográfico de `body`, scrollbars temáticos, selección de texto, y los efectos opcionales `theme-glow` / `theme-glitch` (cyberpunk).

### 3. Refinar las 7 paletas (`src/lib/themes.ts`)

Cada tema se redefine con criterios SaaS premium: contraste AA, superficies elevadas distinguibles, primario con buena legibilidad sobre fondo, y mute-foreground siempre legible (no más texto gris perdido). Identidad conservada:

- **Midnight Pro** — slate profundo + teal eléctrico (tipo Linear)
- **Crystal Clear** — blanco roto + indigo (tipo Vercel/Stripe light)
- **Neon City** — violeta/magenta sobre negro púrpura, glow controlado
- **Deep Forest** — verde bosque + lima, cálido orgánico
- **Deep Ocean** — azul abisal + cian, sereno corporativo
- **Golden Hour** — marrón cálido + ámbar/coral
- **Nord** — gris azulado nórdico, minimalista

Para cada uno: revisar tamaños/letter-spacing/line-height tipográficos, sombras suaves (no las actuales planas), radios consistentes.

### 4. Pulir las tarjetas de especie (Stock)

- Reemplazar `text-emerald-400`, `border-border/50`, gradientes hardcoded por tokens semánticos (`text-primary`, `border-border`, `bg-card`).
- Aumentar tamaño del nombre de la especie (de `text-sm` a `text-base font-bold`), separar precio en una segunda línea con su propio chip, y mostrar el total como `Badge` destacado.
- Tabla: header con `bg-muted/40`, celdas con `text-foreground` por defecto y `text-muted-foreground` solo para metadatos, números a la derecha con tabular-nums.

### 5. Arreglar botones de acción (cajas y lotes) — lo que mencionaste

En `src/components/boxes-view.tsx` y `rodents.lots.tsx` / `insects.lots.tsx`:

- Subir tamaños: de `h-6 text-[9px] px-1.5` → `h-8 text-xs px-3` con `gap-1.5`.
- Usar variantes shadcn correctas: **QR** = `outline`, **Editar** = `secondary`, **Eliminar** / **Dividir** = `outline` con `text-destructive hover:bg-destructive/10` para eliminar.
- Iconos `h-3.5 w-3.5` con label visible siempre (no solo en hover).
- Agrupar las acciones en una fila al pie de la tarjeta con `border-t` y `bg-muted/20` para que se lean como una toolbar.

### 6. Pulido general transversal

- **Sidebar** (`app-sidebar.tsx`): usar tokens `--sidebar-*`, item activo con barra lateral de `--primary`, hover sutil.
- **PageShell**: títulos con `font-display`, subtítulos `text-muted-foreground`, separación más generosa.
- **Cards globales** (dashboard, billing, settings): superficie elevada con `shadow-sm`, hover con `shadow-md` + `-translate-y-0.5` sutil, radio consistente.
- **Inputs / Selects**: focus ring con `--ring` del tema, no el ring genérico.
- **Badges de estado**: paleta dedicada (success/warning/error/info) que respete contraste en cada tema.

### 7. QA visual

- Recorrer las pantallas clave (`/stock`, `/rodents/boxes`, `/rodents/lots`, `/insects/boxes`, `/insects/lots`, `/`, `/settings`, `/billing`, `/ai`) en los 7 temas vía screenshots y verificar:
  - Contraste de texto principal y secundario.
  - Botones de acción legibles.
  - Tablas con jerarquía clara.
  - Tarjetas con bordes y sombras consistentes.

## Detalles técnicos (referencia)

```text
Archivos a editar
├── src/hooks/use-theme.ts          → mapear a tokens shadcn
├── src/lib/themes.ts               → refinar 7 paletas + tokens shadcn por tema
├── src/styles/themes.css           → eliminar overrides globales agresivos
├── src/styles.css                  → revisar tokens base shadcn
├── src/routes/stock.tsx            → rediseñar RodentSpeciesCard / InsectSpeciesCard
├── src/components/boxes-view.tsx   → toolbar de acciones (QR/Editar/Eliminar)
├── src/routes/rodents.lots.tsx     → toolbar de acciones (Dividir/Editar/Eliminar)
├── src/routes/insects.lots.tsx     → toolbar de acciones (Dividir/Editar/Eliminar)
├── src/components/app-sidebar.tsx  → tokens --sidebar-*
└── src/components/page-shell.tsx   → jerarquía tipográfica
```

Sin cambios en: lógica de negocio, queries, mutations, schema, auth.

## Riesgos y mitigación

- **Riesgo**: un tema podría no convencerte. → Mitigación: si pasa, ajustamos paleta puntual en una iteración rápida (5 min).
- **Riesgo**: romper estilos en pantallas no listadas. → Mitigación: como migramos a tokens semánticos que ya usa shadcn, el comportamiento por defecto mejora en toda la app sin tocar archivo por archivo.
