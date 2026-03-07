# Cómo ejecutar los scripts SQL

**Recomendado:** Si eres administrador, en la app ve a **Configuración → pestaña Base de datos** y haz clic en **«Actualizar base de datos»**. Ese botón aplica todas las actualizaciones pendientes (incluidas pagos parciales, enlace Mis documentos, estado En espera de cliente, días facturas impagadas) tanto en **local** como en **producción**. No necesitas ejecutar los `.sql` a mano salvo que prefieras hacerlo.

Si aun así quieres ejecutar los scripts manualmente, puedes hacerlo de dos maneras: con **phpMyAdmin** o con la **línea de comandos** de MySQL.

---

## Opción 1: phpMyAdmin (recomendado en XAMPP)

1. Abre el navegador y entra en **http://localhost/phpmyadmin**
2. Inicia sesión si te lo pide (en XAMPP suele ser usuario `root` sin contraseña).
3. En el panel izquierdo, **selecciona tu base de datos** (por ejemplo `presunavegatel` o `u600265163_HAggBlS0j_presup` en producción).
4. Arriba, haz clic en la pestaña **"SQL"**.
5. Abre cada archivo `.sql` con un editor de texto, **copia todo su contenido** y pégalo en la caja de texto de phpMyAdmin.
6. Haz clic en **"Continuar"** o **"Ejecutar"**.
7. Si aparece un error tipo "Duplicate column" o "already exists", suele significar que ese cambio ya está aplicado; puedes ignorarlo e ir al siguiente script.

**Orden recomendado** (los que añadimos para las nuevas funciones):

| Script | Para qué sirve |
|--------|----------------|
| `create_invoice_payments.sql` | Pagos parciales en facturas |
| `add_client_view_token.sql` | Enlace "Mis documentos" para clientes |
| `add_quote_status_waiting_client.sql` | Estado "En espera de cliente" en presupuestos |
| `add_overdue_invoice_days_setting.sql` | Opcional: días configurables para facturas impagadas (la app puede crearlo al guardar en Ajustes) |

El resto de scripts (`add_audit_log.sql`, `add_tags_columns.sql`, etc.) ejecútalos solo si usas esas funciones y aún no los has ejecutado.

---

## Opción 2: Línea de comandos (MySQL)

Abre **Símbolo del sistema** o **PowerShell** y, con XAMPP, la ruta de MySQL suele ser `C:\xampp\mysql\bin\`.

Sustituye `NOMBRE_BASE_DATOS` por el nombre real de tu base (por ejemplo `presunavegatel`).

```cmd
cd C:\xampp\htdocs\presup\scripts

C:\xampp\mysql\bin\mysql.exe -u root -p NOMBRE_BASE_DATOS < create_invoice_payments.sql
C:\xampp\mysql\bin\mysql.exe -u root -p NOMBRE_BASE_DATOS < add_client_view_token.sql
C:\xampp\mysql\bin\mysql.exe -u root -p NOMBRE_BASE_DATOS < add_quote_status_waiting_client.sql
C:\xampp\mysql\bin\mysql.exe -u root -p NOMBRE_BASE_DATOS < add_overdue_invoice_days_setting.sql
```

Te pedirá la contraseña del usuario `root` de MySQL (en XAMPP recién instalado suele estar vacía: pulsa Enter).

**Si no quieres escribir la contraseña en cada línea**, puedes entrar en MySQL y ejecutar los scripts desde dentro:

```cmd
cd C:\xampp\htdocs\presup\scripts
C:\xampp\mysql\bin\mysql.exe -u root -p NOMBRE_BASE_DATOS
```

Dentro del cliente MySQL:

```sql
source create_invoice_payments.sql;
source add_client_view_token.sql;
source add_quote_status_waiting_client.sql;
source add_overdue_invoice_days_setting.sql;
```

(En Windows, si `source` da error, usa la ruta completa, por ejemplo: `source C:/xampp/htdocs/presup/scripts/create_invoice_payments.sql;`)

---

## Resumen rápido

- **Solo necesitas ejecutar cada script una vez** por base de datos.
- Si un script falla por "column already exists" o "Duplicate", ese paso ya estaba hecho; sigue con el siguiente.
- En **producción** (Hostinger u otro), usa el panel que te den para MySQL (phpMyAdmin o Bases de datos) y ejecuta ahí el contenido de cada `.sql` sobre la base de datos de la app.

---

## Si creas un script nuevo

**Cada vez que añadas un nuevo `.sql`** para la base de datos, debes **también** incorporar esa misma migración en el `case 'upgrade_database'` de `api.php`, para que el botón «Actualizar base de datos» la ejecute. Detalles en **REGLA_NUEVOS_SCRIPTS_BD.md**.
