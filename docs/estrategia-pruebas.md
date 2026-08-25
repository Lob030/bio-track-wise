# Estrategia de pruebas automatizadas

## Capas

`tests/unit` se ejecuta sin navegador, Supabase ni secretos. Protege reglas deterministas: importación/exportación CSV, permisos de UI, cálculos de población y biomasa, validación de sublotes, FIFO, alertas, conciliación y resúmenes de reportes.

`tests/rls-integration.test.ts` y `tests/security-integration.test.ts` requieren una instancia Supabase local o staging aislado. Crean usuarios reales, organizaciones independientes y verifican RLS, RPC, triggers, transacciones e inmutabilidad contra PostgreSQL.

## Matriz de cobertura

| Área                         | Unidad                                             | Integración Supabase                                                                  |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Autenticación e invitaciones | No aplica: depende de Auth                         | Alta de usuarios, inicio de sesión, invitación y aceptación                           |
| Roles y permisos             | Regla admin/operador/sin rol                       | Administración de equipo, suspensión y cambios prohibidos                             |
| RLS y organizaciones         | No aplica: es política de BD                       | Lectura cruzada bloqueada, bitácora inmutable, aislamiento                            |
| Lotes, sublotes y genealogía | Validación de cantidades y saldos                  | Ciclos, fechas, cajas y relaciones entre organizaciones                               |
| Líneas genéticas y cajas     | No aplica                                          | Unicidad y compatibilidad especie/línea/caja                                          |
| Nacimientos y reproducción   | Saldos derivados                                   | RPC idempotente, padres compatibles y relaciones válidas                              |
| Mortalidad y movimientos     | Conciliación de balances                           | Eventos estructurados, ledger y movimiento sin cambio de saldo                        |
| Inventario y compras         | Conciliación                                       | Compra transaccional, datos negativos e idempotencia                                  |
| Ventas y FIFO                | Orden FIFO e insuficiencia                         | Commit/rollback, doble envío y usuarios simultáneos                                   |
| Alertas                      | Comparadores                                       | Generación, deduplicación, reconocimiento y resolución                                |
| CSV                          | Comillas, BOM, CRLF, vacíos y entradas malformadas | Importadores de pantalla deben validarse manualmente hasta tener pruebas de navegador |
| Reportes                     | Población y biomasa activas                        | Datos base y eventos que alimentan el reporte                                         |

## Comandos

```powershell
npm run test:unit
npm run lint
npm run typecheck
npm run build
npm run check
```

Para integración, copiar `.env.test.example` a `.env.test.local`, iniciar Supabase local y exponer las claves solo a ese proceso:

```powershell
npx supabase start
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY = "..."
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
npm run test:integration
```

`npm run test:all` une ambas capas. No usar credenciales de producción: las pruebas crean y eliminan usuarios y organizaciones.

## Concurrencia y errores

La integración incluye revocación simultánea de administradores, competencia por inventario en ventas, doble envío de ventas, compras, mortalidad, reproducción y alertas. También cubre cantidades insuficientes, datos negativos, relaciones cruzadas, permisos inválidos y actualizaciones inmutables.

## Riesgos pendientes

- No hay pruebas de navegador para formularios, diálogos, toasts, navegación ni carga/descarga real de archivos.
- Las notificaciones externas de alertas no existen aún; por ello tampoco tienen pruebas de entrega o reintento.
- Restauración de respaldos y ejecución programada requieren una instancia Supabase y base desechable reales.
- La cobertura porcentual no se publica todavía: el proyecto no incluye un proveedor de instrumentación de Vitest. Agregarlo requiere instalar `@vitest/coverage-v8` y fijar umbrales después de la primera medición confiable.
