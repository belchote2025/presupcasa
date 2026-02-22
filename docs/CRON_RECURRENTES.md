# Procesar facturas recurrentes en segundo plano (cron)

El script `cron_process_recurring.php` ejecuta la misma lógica que el botón "Procesar recurrentes": genera nuevas facturas para las recurrentes cuya **próxima fecha** ya ha llegado y avanza esa fecha.

## Cómo ejecutarlo

- **Solo por línea de comandos (CLI).** No está pensado para llamarse desde el navegador.

### En local (XAMPP / Windows)

1. Crea un archivo vacío llamado `.cron_local` en la raíz del proyecto (`c:\xampp\htdocs\presup\.cron_local`) para que use la base de datos local.
2. Desde la carpeta del proyecto:
   ```bash
   php cron_process_recurring.php
   ```
   Salida esperada: `OK; no hay facturas recurrentes pendientes.` o `OK; creadas: X, actualizadas: Y.`

### En el servidor (Linux / hosting)

1. **Opción A – Variables de entorno**  
   Configura en el cron o en el panel:
   - `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` (y opcionalmente `DB_PORT`).

2. **Opción B – Sin .cron_local**  
   Si no existe `.cron_local`, el script intenta leer la conexión desde `api.php` (misma base de datos que la app).

3. Programar ejecución diaria, por ejemplo a las 8:00:
   ```bash
   0 8 * * * cd /ruta/completa/a/presup && php cron_process_recurring.php >> /ruta/a/presup/logs/cron.out 2>&1
   ```
   Ajusta `/ruta/completa/a/presup` a la ruta real de tu instalación.

## Comprobar que funciona

- Ejecuta a mano: `php cron_process_recurring.php`.
- Si hay recurrentes con próxima fecha ≤ hoy, verás algo como: `OK; creadas: 1, actualizadas: 1.`
- Los errores se escriben en `logs/cron.log` (si la carpeta `logs` existe y es escribible).

## Seguridad

- El script **no** debe llamarse por HTTP (comprueba `php_sapi_name() === 'cli'` y responde 403 si no es CLI).
- No expongas `.cron_local` ni las variables de entorno con credenciales en repositorios públicos.
