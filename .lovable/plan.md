# Ampliar el Asistente IA con 4 nuevas acciones

Añade soporte para registrar ventas, registrar bajas (muertes) y dos nuevas consultas (stock crítico, pedidos pendientes), más una consulta extra de ingresos del mes. Se respeta el flujo actual: las mutaciones piden confirmación; las consultas se ejecutan directo.

## 1. `src/lib/ai-assistant.functions.ts`

**Schema (`ParsedActionSchema` union):**
- Añadir `register_sale`: `{ type, description, clientName?, totalMxn:number, notes? }`.
- Añadir `register_death`: `{ type, description, lotCode:string, count:number, cause: enum(desconocida|enfermedad|pelea|escapo|estres|malas_condiciones|neonato|otro).default("desconocida") }`.
- Extender el enum `queryType` del tipo `query` con: `critical_stock`, `pending_orders`, `revenue_this_month` (además de los existentes).

**`buildSystemPrompt`:**
- Añadir ejemplos en español para: "Vendí 500 pesos a Juan" → `register_sale`; "Murieron 3 ratones del lote L12 por enfermedad" → `register_death`; "¿Qué insumos están en stock crítico?" → `query/critical_stock`; "¿Cuántos pedidos pendientes tengo?" → `query/pending_orders`; "¿Cuánto vendí este mes?" → `query/revenue_this_month`.
- Actualizar la línea de REGLAS de tipos válidos para incluir `register_sale` y `register_death`.

**`regexFallback`:** añadir heurísticas básicas (palabras "vend"/"venta" → register_sale con monto detectado; "muri"/"baja"/"murieron" + lote → register_death; "stock"/"crítico"/"insumo" → critical_stock; "pendiente"/"pedido" → pending_orders; "vend"/"ingreso"+"mes" → revenue_this_month) para no romper cuando el modelo falle.

## 2. `src/routes/ai.tsx`

**`requiresConfirmation`:** añadir `register_sale` y `register_death` (son mutaciones).

**Mensaje de bienvenida:** mencionar las nuevas capacidades (registrar ventas, registrar bajas, consultar stock crítico / pedidos pendientes / ingresos del mes).

**`runQuery`** (nuevas ramas):
- `critical_stock`: contar/listar `warehouse_food` con `quantity_grams <= min_stock_grams`.
- `pending_orders`: contar `orders` con `status = "preparando"`.
- `revenue_this_month`: sumar `total_mxn` de `orders` en estado `historial` con `delivered_at` dentro del mes actual.

**`execute`** (nuevas ramas):
- `register_sale`: resolver `client_id` por `clientName` (ilike, opcional → null si no existe); insertar en `orders` con `owner_id`, `client_id`, `subtotal_mxn=totalMxn`, `total_mxn=totalMxn`, `discount_pct=0`, `status="historial"`, `delivered_at=now()`, `notes`. Invalidar `["orders"]`. (Se registra como venta cerrada para que cuente en ingresos del mes.)
- `register_death`: resolver lote por `lot_code` (eq owner_id). Reducir población en orden unsexed→females→males siguiendo el patrón de `rodents.lots.tsx`, sumar `count` a `total_deaths`, marcar `status="finalizado"` si la población llega a 0, y anexar nota `Baja <fecha>: <count> (<cause>)`. Validar que `count` no supere la población. Invalidar `["lots"]`.

## Notas técnicas

- Las nuevas consultas usan el cliente `supabase` del navegador (con RLS por `owner_id`), igual que las consultas existentes.
- `register_sale` no crea `order_items` ni descuenta inventario (es un registro rápido de monto); el flujo completo sigue en `/sales`.
- Tipado estricto: usar `Extract<ParsedAction, { type: "..." }>` en cada rama. Sin errores de TypeScript; el build debe pasar.

## Verificación

- Probar cada comando nuevo en `/ai` y confirmar que las mutaciones piden confirmación y las consultas responden.
- Confirmar que `revenue_this_month` refleja una venta recién registrada con `register_sale`.
