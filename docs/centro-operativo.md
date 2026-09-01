# Centro operativo de BioTrack

El Centro Operativo reúne las mejoras de jornada, ubicación física, protocolos, sanidad, reproducción, planeación e inventario profesional. Calidad y cumplimiento documental quedan fuera de esta fase por decisión de alcance.

## Flujo diario

1. Un administrador configura `Sede > Sala > Rack > Nivel > Posición` y asigna las cajas.
2. Define protocolos y los asigna a lotes o cajas.
3. Ejecuta **Generar jornada** cada día. En producción esta RPC puede programarse antes del inicio del turno.
4. Los operadores completan u omiten tareas con motivo, tiempo y mediciones. Las finalizaciones son inmutables.
5. Si existe una tarifa de mano de obra, el tiempo completado se asigna automáticamente al costo del lote.

## Sanidad y reproducción

Los casos sanitarios conservan restricciones de cuarentena, venta y reproducción, seguimientos y tratamientos. Mientras un caso restringido siga abierto, PostgreSQL bloquea las asignaciones de venta y los eventos reproductivos del lote. El cierre requiere un administrador y una resolución. Los programas reproductivos agrupan parejas, tríos, grupos o colonias y enlazan sus eventos al historial reproductivo existente.

## Planeación y abastecimiento

La proyección usa edad, población o biomasa y el protocolo asignado para estimar alimento, separación y venta. La cabecera y la línea de cada orden de compra se crean dentro de una sola transacción. Las recepciones actualizan lote, existencia y costo promedio atómicamente. Los consumos descuentan primero el lote con vencimiento más próximo y conservan las asignaciones FIFO en eventos inmutables.

El inventario unificado presenta en una sola lectura los insumos profesionales, el alimento histórico y los sustratos. Una correspondencia protegida sincroniza los saldos históricos con el catálogo consolidado y evita modificarlos desde dos módulos a la vez. Las nuevas compras, recepciones, consumos, mermas y ajustes se gestionan desde **Centro Operativo > Insumos**; alimento y sustrato históricos conservan sus flujos especializados. Cada consumo consolidado con lote genera su costo y asignación de producción dentro de la misma transacción. La cobertura reúne los tres historiales de consumo de los últimos 30 días, el tiempo de entrega y el stock mínimo para mostrar riesgo y cantidad sugerida.

## Turnos, QR y trabajo sin conexión

Cada organización configura su zona horaria y uno o más turnos semanales. La jornada automática conserva la hora local y asigna el turno que cubre la hora planeada. Un administrador puede asignar miembros a turnos y tareas pendientes a un usuario o turno concreto.

El lector QR de ubicaciones selecciona la caja leída para agilizar movimientos. Requiere HTTPS y permiso de cámara. Cuando se pierde conectividad, solo la finalización de tareas puede quedar en cola local; nacimientos, mortalidad, inventario y demás operaciones biológicas continúan exigiendo conexión para evitar conflictos de saldos. La cola mantiene el mismo `request_id`, por lo que la sincronización es idempotente.

## Operación programada

Programar la Edge Function `generate-operational-tasks` una vez al día. La función valida `x-cron-secret`, usa `service_role` exclusivamente en servidor e itera todas las organizaciones mediante `generate_all_operational_tasks`. La restricción única de tareas evita duplicados al reintentar. Revisar diariamente tareas vencidas, casos críticos, stock bajo y lotes próximos a caducar desde el dashboard ejecutivo.
