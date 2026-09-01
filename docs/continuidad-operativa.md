# Continuidad operativa de BioTrack

## Objetivos

- RPO de producción: 15 minutos para datos PostgreSQL mediante PITR.
- RTO objetivo: 4 horas, sujeto al tamaño de la base y al tiempo de restauración de Supabase.
- La exportación JSON de Configuración sirve para consulta operativa. No reemplaza un respaldo lógico o PITR.

## Alertas automáticas

La Edge Function `evaluate-alerts` ejecuta `evaluate_alert_rules` para todas las organizaciones. Se recomienda cada 15 minutos. Una condición mantiene una sola alerta abierta; reconocerla no la resuelve. Se resuelve automáticamente cuando deja de cumplirse o manualmente por un administrador.

Configurar secretos exclusivamente en Supabase:

```powershell
supabase secrets set ALERT_CRON_SECRET="valor-aleatorio-largo"
supabase functions deploy evaluate-alerts --no-verify-jwt
```

En SQL Editor, habilitar Cron y `pg_net`, guardar URL y secreto en Vault y programar:

```sql
select vault.create_secret('https://PROJECT_REF.supabase.co', 'biotrack_project_url');
select vault.create_secret('EL_MISMO_ALERT_CRON_SECRET', 'biotrack_alert_cron_secret');

select cron.schedule(
  'biotrack-evaluate-alerts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'biotrack_project_url')
      || '/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'biotrack_alert_cron_secret'),
      'x-invocation-id', gen_random_uuid()::text
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Ante un error de una regla, las demás continúan y la ejecución queda como `completed_with_errors`. Un fallo global devuelve HTTP 500; Cron reintenta en la siguiente ventana. El administrador revisa diariamente `alert_evaluation_runs` y los logs de Edge Functions. Escalar si no existe una ejecución completada en 30 minutos.

## Política de respaldos

| Copia | Frecuencia | Retención | Responsable |
| --- | --- | --- | --- |
| Supabase PITR | Continua | 7 días | Administrador de plataforma |
| Dump lógico cifrado fuera de Supabase | Semanal | 8 semanas | Administrador de plataforma |
| Dump lógico mensual | Mensual | 12 meses | Responsable de continuidad |
| Exportación JSON por organización | Semanal y antes de cambios masivos | 90 días | Administrador del bioterio |
| Objetos de Supabase Storage | Diaria, repositorio externo cifrado | 30 días | Administrador de plataforma |

Supabase mantiene respaldos diarios en planes compatibles; la retención depende del plan. Los respaldos de base no incluyen el contenido binario de Storage, solamente sus metadatos. Por eso Storage se copia por separado. No borrar un proyecto confiando en que sus respaldos seguirán disponibles.

Los archivos fuera de Supabase deben cifrarse, almacenarse en otra cuenta o proveedor, limitarse al equipo de continuidad y verificarse con SHA-256. Las URL de base, tokens de administración y `service_role` solo viven en el gestor de secretos/CI, nunca en variables `VITE_*`, código cliente ni archivos exportados.

## Respaldo lógico

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://..."
.\scripts\create-logical-backup.ps1 -OutputRoot D:\BioTrackBackups
```

Copiar el directorio resultante a almacenamiento cifrado fuera de Supabase y verificar `manifest.json`.

## Restauración y prueba

1. Declarar incidente, detener importaciones y escrituras, y registrar la hora del último dato válido.
2. Preferir PITR para producción y seleccionar un instante anterior al incidente.
3. Para un dump lógico, crear una base Supabase o PostgreSQL desechable y vacía.
4. Ejecutar la prueba; nunca apuntar a producción:

```powershell
$env:RESTORE_DATABASE_URL = "postgresql://...base-desechable..."
.\scripts\test-restore.ps1 -BackupDirectory D:\BioTrackBackups\biotrack-YYYYMMDD-HHMMSS -ConfirmDisposableTarget
```

5. Confirmar `restore_verified`, conciliación de lotes, RLS y ausencia de alertas abiertas duplicadas.
6. Validar manualmente usuarios, lotes, eventos, inventario, ventas y últimos movimientos.
7. Reconfigurar secretos, Edge Functions, Cron, Auth Redirect URLs, Realtime y Storage cuando se restaure en un proyecto nuevo.
8. Abrir la escritura, vigilar errores durante una hora y documentar pérdida real de datos y causa raíz.

Se debe ejecutar un simulacro trimestral. Guardar fecha, respaldo usado, duración, conteos, incidencias y firma del responsable. Una restauración no se considera probada hasta completar el script contra una base desechable.

Referencias oficiales: [respaldos de base de datos](https://supabase.com/docs/guides/platform/backups), [programación de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) y [respaldo/restauración con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Checklist de recuperación

- [ ] Identificar incidente, alcance, organización y hora de corte.
- [ ] Nombrar responsable técnico y responsable operativo.
- [ ] Bloquear escrituras e importaciones; conservar evidencia y logs.
- [ ] Rotar credenciales si existe sospecha de exposición.
- [ ] Elegir PITR o dump lógico y verificar fecha, retención y SHA-256.
- [ ] Restaurar primero en un destino desechable.
- [ ] Ejecutar `test-restore.ps1` y conservar su salida.
- [ ] Comparar organizaciones, usuarios, lotes, eventos, inventarios y ventas.
- [ ] Verificar RLS, roles, conciliación de saldos y deduplicación de alertas.
- [ ] Restaurar por separado objetos de Storage y comprobar referencias.
- [ ] Reconfigurar secretos, Auth, Cron, Edge Functions y Realtime.
- [ ] Realizar prueba funcional con administrador y operador.
- [ ] Autorizar reapertura, comunicar RPO/RTO real y vigilar durante una hora.
- [ ] Documentar causa raíz y acciones preventivas.
