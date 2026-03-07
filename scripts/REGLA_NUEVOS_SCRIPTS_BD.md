# Regla: nuevos scripts de base de datos

**Cada vez que se cree un script SQL nuevo en este proyecto** (por ejemplo en `scripts/*.sql`), hay que hacer **siempre** lo siguiente:

1. **Añadir la migración equivalente en `api.php`** dentro del `case 'upgrade_database':`, para que el botón **«Actualizar base de datos»** (Configuración) ejecute ese cambio tanto en local como en producción.

2. **Orden:** Añadir el nuevo bloque al final del `try { ... }` del `upgrade_database`, antes del `echo json_encode([ "status" => "success", ... ])`.

3. **Formato:** Usar comprobaciones tipo `SHOW TABLES LIKE 'nombre_tabla'` o `SHOW COLUMNS FROM tabla LIKE 'columna'` y solo ejecutar `CREATE TABLE` / `ALTER TABLE` si no existe. Añadir a `$allChanges[]` un texto breve que describa el cambio (ej. `"Tabla invoice_payments"` o `"customers.view_token"`).

4. **Opcional:** Crear el archivo `.sql` en `scripts/` para quien quiera ejecutarlo a mano (phpMyAdmin o línea de comandos). La app no lee esos archivos; el botón «Actualizar base de datos» usa solo el código en `api.php`.

Así, un solo clic en **Actualizar base de datos** deja la base al día en cualquier entorno, sin tener que ejecutar scripts a mano.
