# Copias de seguridad programadas

Puedes automatizar las copias de seguridad para que se ejecuten **diariamente**, **semanalmente** (un día concreto) o **mensualmente** (un día del mes), y enviarlas por **email** y/o a una **URL (webhook)** para guardarlas en la nube (Drive, OneDrive, etc.).

## Dónde se configura

En la app: **Configuración → pestaña Copia de seguridad** (o Backup). Ahí verás:

- **Frecuencia**: No programado | Diario | Semanal | Mensual
- **Día**: para semanal (Lunes–Domingo) o para mensual (1–28)
- **Hora**: 0–23 (hora del servidor)
- **Enviar por email**: usa el email de "Backup por email" (Integraciones)
- **Enviar a URL (webhook)**: para subir la copia a Drive, OneDrive o cualquier servicio que acepte un POST con JSON

Guarda la configuración con el botón **Guardar Configuración**.

## Cómo programar la ejecución (cron)

El script `cron_backup.php` comprueba si **hoy** y **esta hora** toca hacer copia según la configuración. Debes ejecutarlo de forma periódica:

### Ejecutar cada hora (recomendado)

Así, cuando la hora configurada coincida con la del sistema, se hará la copia:

```bash
0 * * * * cd /ruta/completa/a/presup && php cron_backup.php >> /ruta/a/presup/logs/cron_backup.log 2>&1
```

### Ejecutar una vez al día

Si solo quieres una ejecución diaria a una hora fija (por ejemplo las 8:00), programa:

```bash
0 8 * * * cd /ruta/completa/a/presup && php cron_backup.php >> /ruta/a/presup/logs/cron_backup.log 2>&1
```

En ese caso, la opción "Semanal" o "Mensual" seguirá funcionando: el script solo enviará la copia cuando el día de la semana (o el día del mes) coincida con el configurado.

## En local (XAMPP)

1. Crea el archivo `.cron_local` en la raíz del proyecto para usar la base de datos local.
2. Prueba: `php cron_backup.php`  
   - Si no toca ejecutar según la configuración, no hará nada (salida 0).  
   - Para probar el envío, configura "Diario" y la hora actual, guarda, y ejecuta el script.

## Destino en la nube (webhook)

Si activas **"Enviar a una URL"** e indicas una URL:

- El script enviará un **POST** con el cuerpo en JSON (el mismo contenido de la copia de seguridad).
- Esa URL puede ser un webhook de **Zapier**, **Make (Integromat)** o **IFTTT** que, por ejemplo, guarde el archivo en Google Drive o OneDrive.
- También puedes usar un pequeño script en tu servidor que reciba el POST y suba el JSON a la nube.

Ejemplo de flujo en Zapier: disparador "Webhooks by Zapier" (Catch Hook) → acción "Google Drive - Upload File" (subir el contenido del body como archivo).

## Seguridad

- El script **solo** debe ejecutarse por CLI (no por HTTP).
- No expongas la URL del webhook si contiene datos sensibles; usa HTTPS y, si el servicio lo permite, un token en la URL o en cabeceras.
