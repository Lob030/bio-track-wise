# Centro de control profesional

La ruta `/professional` concentra nueve capacidades operativas: conciliacion de saldos, aprobacion de ajustes, rentabilidad, pronostico de compras, mantenimiento preventivo, etiquetas QR, excepciones, importacion CSV y permisos por sede. Los operadores acceden a mantenimiento y etiquetas dentro de las sedes asignadas; los demas modulos son administrativos.

## Reglas operativas

- Todo ajuste manual se solicita desde Operaciones y requiere la decision de otro administrador. El solicitante no puede aprobar su propia solicitud.
- La rentabilidad se presenta por lote, especie, linea genetica y cliente usando ingresos asignados y costo reconocido.
- Los mantenimientos conservan activo, plan, responsable, resultado, evidencia opcional, costo y siguiente fecha.
- Las etiquetas solo se generan para registros de la organizacion activa y cada impresion queda registrada.
- La importacion admite hasta 500 insumos o clientes por trabajo. Primero valida y previsualiza; la aplicacion completa ocurre en una sola transaccion.
- Cuando un usuario tiene ubicaciones asignadas, RLS limita sedes, cajas, lotes y tareas a esas ubicaciones y su jerarquia.
- Los QR de caja, lote y ubicacion abren `/operate` con el contexto correspondiente. Una ubicacion incluye las cajas de sus descendientes visibles.
- Los lotes no se eliminan: se finalizan en cero mediante `finalize_lot_tx` y conservan eventos, costos y auditoria.

## Puesta en marcha

1. Aplicar `20260808000005_professional_control_center.sql` y `20260809000001_professional_integration_hardening.sql` en una base limpia y luego en staging.
2. Ejecutar pruebas de integracion con dos administradores, un operador y dos organizaciones.
3. Asignar accesos por sede desde `Control profesional > Sedes`.
4. Probar una solicitud y aprobacion de inventario con usuarios distintos.
5. Validar impresion en el modelo real de impresora y etiquetas del bioterio.
6. Probar un CSV con errores y confirmar que ninguna fila se inserta.

La migracion revoca el RPC de ajuste directo a clientes autenticados. No se debe volver a conceder ese permiso, porque eliminaria el control de doble aprobacion.
