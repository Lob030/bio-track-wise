# Puerta de salida a producción

BioTrack solo recibe estado **GO** cuando todos los puntos siguientes tienen evidencia fechada. Un build exitoso por sí solo no autoriza producción.

## Evidencia automática

```powershell
npm ci
npm run check
npm run verify:production
npx supabase db reset --local
npm run test:integration
node scripts/verify-production.mjs --strict-env
```

Conservar la salida de CI, el SHA desplegado y el resultado de `/healthz`. Las migraciones deben aplicarse desde cero y también sobre una copia anonimizada de staging.

## Evidencia de infraestructura

- Respaldo reciente con SHA-256 y restauración exitosa en destino desechable.
- `SITE_URL`, versiones y secretos configurados en gestores del servidor, nunca como `VITE_*`.
- Redirect URL de Supabase Auth para `/accept-invite` en staging y producción.
- Cron de alertas ejecutado en los últimos 30 minutos sin organizaciones omitidas.
- Monitoreo de `/healthz`, errores SSR y `client-errors` activo y con límites de tasa.

## Validación operativa

- Administrador y operador prueban aislamiento, permisos e invitación real.
- Personal de roedores e insectos concilia una muestra de lotes, población, biomasa y movimientos.
- Administración valida costo por lote, alimento, sustrato, depreciación, COGS y margen contra un cálculo manual.
- En teléfono HTTPS real se prueba instalación PWA, QR, baja, movimiento y sustrato; no se aceptan operaciones sin conexión.
- Se ejecuta una venta y una compra de prueba, luego se concilian saldos y auditoría.

## Decisión

**NO-GO** si falla una migración limpia, una prueba RLS/transaccional, una restauración, una conciliación de saldos o una validación de permisos. El responsable técnico registra el defecto y el responsable operativo confirma la nueva ventana. **GO** requiere firma de ambos responsables y plan de reversión asociado al SHA liberado.
