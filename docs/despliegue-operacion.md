# Despliegue y operación de BioTrack

## Variables de entorno

Usar `.env.example` como referencia. Solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_APP_VERSION` llegan al navegador. La publishable key de Supabase no es un secreto; RLS y las políticas de base de datos son el control de acceso real.

Nunca exponer `SUPABASE_SERVICE_ROLE_KEY`, contraseñas de base, tokens de Supabase Management API, `ALERT_CRON_SECRET`, `OPERATIONS_CRON_SECRET` ni URLs de conexión en variables `VITE_*`, código cliente, CSV, logs o capturas de errores.

En Cloudflare, cargar secretos fuera del repositorio:

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ALERT_CRON_SECRET
npx wrangler secret put OPERATIONS_CRON_SECRET
```

Las Edge Functions de Supabase usan secretos independientes:

```powershell
npx supabase secrets set ALERT_CRON_SECRET=... OPERATIONS_CRON_SECRET=...
npx supabase functions deploy evaluate-alerts --no-verify-jwt
npx supabase functions deploy generate-operational-tasks --no-verify-jwt
```

Programar un `POST` diario a `/functions/v1/generate-operational-tasks` con el encabezado `x-cron-secret`. La hora recomendada es 00:05 en una zona operativa estable; cada organización convierte después las tareas a su zona IANA configurada. El programador debe reintentar con espera incremental y alertar tras tres fallos. Los reintentos no duplican tareas.

Definir `APP_VERSION` en el entorno de Worker con el SHA de la versión desplegada. Definir `SITE_URL` con el origen HTTPS público exacto, sin ruta, para los enlaces de invitación. La aplicación rechaza invitaciones si `SITE_URL` falta o usa HTTP fuera de localhost. El navegador recibe `VITE_APP_VERSION` durante el build. El endpoint `GET /healthz` responde versión y estado sin consultar ni revelar datos operativos.

## Build y despliegue reproducible

1. Usar Node y npm bloqueados por `package-lock.json`.
2. Ejecutar `npm ci`.
3. Ejecutar `npm run test:ci`.
4. Ejecutar `npm run verify:production`; en CI de despliegue usar `node scripts/verify-production.mjs --strict-env`.
5. En staging, aplicar migraciones y ejecutar `npm run test:integration` con credenciales de prueba.
6. Regenerar tipos con `npm run types:generate:linked` y comprobar que el diff corresponde al esquema desplegado.
7. Construir con `npm run build`.
8. Desplegar el mismo commit: `npx wrangler deploy`.
9. Verificar `GET /healthz`, inicio de sesión, una lectura RLS de operador y los logs del Worker.

El PWA usa actualización automática y limpia cachés obsoletos. Cada despliegue debe cambiar `VITE_APP_VERSION`; para validar la actualización, abrir una sesión existente, publicar la nueva versión y confirmar que el service worker activa la revisión nueva sin servir recursos anteriores.

## Migraciones en staging y producción

1. Respaldar y probar restauración antes de tocar producción. Consultar `docs/continuidad-operativa.md`.
2. En una base limpia local, iniciar Supabase y ejecutar todas las migraciones:

```powershell
npx supabase start
npx supabase db reset
```

3. Confirmar que no hay errores de migración, que RLS está activo y que `npm run test:integration` pasa contra esa instancia.
4. Revisar el SQL de la nueva migración, impacto de locks, índices concurrentes cuando corresponda y plan de datos históricos.
5. Aplicar en staging con `npx supabase db push --linked`; verificar health check, alertas y conciliación de saldos.
6. Programar ventana de producción, ejecutar el respaldo y aplicar una sola vez con el mismo comando.

Las migraciones son append-only. No editar una migración ya aplicada.

En Windows, `npm run verify:migrations` ejecuta el reset solo sobre la base
local. Para incluir las pruebas de integraciÃ³n, ejecutar `powershell
-ExecutionPolicy Bypass -File scripts/verify-clean-db.ps1 -RunIntegration`.

## Rollback

No usar `db reset` ni eliminar migraciones en producción. Si la nueva versión de aplicación falla pero los datos están sanos, volver a desplegar el commit anterior con Wrangler. Si una migración ya aplicada requiere reversión, crear una nueva migración correctiva y validar primero en staging.

Para corrupción o pérdida de datos: detener escrituras, elegir un punto PITR o respaldo lógico, restaurar primero a una base desechable y seguir el checklist de recuperación de `docs/continuidad-operativa.md`. La restauración sobre producción requiere responsable técnico y aprobación operativa explícita.

## Monitoreo y límites

- Cloudflare Worker Logs: buscar eventos `biotrack-client-error` y errores SSR.
- Aplicar una regla de rate limiting de Cloudflare a `POST /client-errors`; el endpoint limita cuerpos a 16 KiB y no persiste datos de sesiÃ³n.
- `GET /healthz`: monitorear cada minuto; alertar tras dos fallos consecutivos.
- `alert_evaluation_runs`: revisar que exista una ejecución reciente por organización.
- Consultas de reportes: eventos limitados a 500, inventario a 500, reproducción a 250, lotes a 2,000, insumos a 500 y clientes a 1,000. Para reportes históricos mayores, crear una RPC agregada paginada; no aumentar límites del navegador indiscriminadamente.
- Bitácora: 50 filas por página, con filtros de acción, entidad, actor y fecha resueltos por Supabase.

## Checklist previo a producción

- [ ] `npm ci` y `npm run test:ci` sin errores.
- [ ] `npm run verify:production` y verificación `--strict-env` aprobadas.
- [ ] Pruebas de integración ejecutadas contra Supabase local o staging aislado.
- [ ] Todas las migraciones aplicadas desde una base limpia.
- [ ] Respaldo reciente y simulacro de restauración documentado.
- [ ] Variables públicas revisadas; ningún secreto en `VITE_*`.
- [ ] Secretos cargados en Cloudflare/Supabase, no en el repositorio.
- [ ] `GET /healthz` responde con la versión esperada.
- [ ] Auth, roles, RLS, ventas/FIFO, alertas y exportación verificados en staging.
- [ ] Cron de alertas y Redirect URLs de Auth configurados.
- [ ] Cron de tareas operativas, secreto y zona horaria de cada organización verificados.
- [ ] Recepción parcial, merma, ajuste y asignación de costo FIFO probados en staging.
- [ ] PWA actualizada y caché anterior invalidada.
- [ ] Cámara y escaneo QR probados en un teléfono HTTPS real; captura bloqueada sin conexión.
- [ ] Logs y responsables de incidente confirmados.
