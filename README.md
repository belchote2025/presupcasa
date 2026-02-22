# PRESUNAVEGATEL

Aplicación web para crear y gestionar presupuestos, facturas, clientes, gastos, citas y proyectos.

## Requisitos

- PHP 7.4+ con extensiones: PDO, pdo_mysql, json, mbstring
- MySQL 5.7+ o MariaDB 10.2+
- Servidor web (Apache, Nginx) o XAMPP en local

## Instalación en local (XAMPP)

1. Copia la carpeta del proyecto en `htdocs` (por ejemplo `htdocs/presup`).
2. Crea la base de datos:
   - **Opción A:** Ejecutar el script PHP desde el navegador:  
     `http://localhost/presup/setup_database_local.php`
   - **Opción B:** Por consola:  
     `php setup_database_local.php`  
   - **Opción C:** Importar en phpMyAdmin el archivo `database_local.sql`
3. La base de datos por defecto es `presunavegatel` (usuario `root`, sin contraseña).
4. Abre en el navegador: `http://localhost/presup/`
5. Inicia sesión con **admin** / **admin123** (cambia la contraseña después).

## Configuración en producción

- En `api.php` y `check_database.php` se usa la IP para detectar local vs producción. En producción se usan las variables de conexión a tu hosting.
- Configura en la app: **Configuración** → datos de empresa, email, nombre del remitente.
- Recomendado: eliminar o restringir el acceso a `check_database.php`, `setup_database_local.php` y scripts de migración una vez todo esté instalado.

## Uso básico

- **Presupuestos:** Editor → crea el documento, guarda. Puedes enviar por email o usar **Enlace para firmar** para que el cliente acepte y firme desde un enlace.
- **Facturas:** Crear desde presupuesto aceptado o desde cero en el editor (cambiar tipo a factura).
- **Clientes:** Agenda de clientes para reutilizar datos en presupuestos y facturas.
- **Válido hasta:** En presupuestos puedes indicar una fecha de validez; en el listado se mostrará "Caducado" o "Caduca en X día(s)" cuando corresponda.

## Estructura principal

- `index.html` – Interfaz de la aplicación
- `app.js` – Lógica frontend
- `api.php` – API y lógica backend
- `database.sql` – Esquema de tablas (sin CREATE DATABASE, para hosting)
- `database_local.sql` – Esquema completo para local (con CREATE DATABASE)
- `style.css` – Estilos

## Licencia

Uso interno / proyecto propio.
