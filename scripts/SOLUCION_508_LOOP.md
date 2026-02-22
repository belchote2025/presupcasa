# Solución al error 508 (Loop Detected) en Hostinger

## Qué significa

El **508 Loop Detected** indica que el servidor ha detectado un bucle de redirecciones al procesar la petición a `api.php`. No llega a ejecutarse tu API y a veces se devuelve la página "Loading..." del alojamiento en lugar de JSON.

## Causas habituales

1. **URL incorrecta**  
   Si la app está en un subdirectorio (ej. `public_html/presup/`), debes entrar siempre por esa ruta:
   - ✅ Correcto: `https://goldenrod-finch-839887.hostingersite.com/presup/`
   - ❌ Incorrecto: `https://goldenrod-finch-839887.hostingersite.com/` (raíz; ahí puede estar otra página y el 508)

2. **.htaccess en la raíz**  
   Un `.htaccess` en `public_html/` (o en la raíz del dominio) que redirige todo a `index.html` o a otra URL puede hacer que las peticiones a `api.php` entren en un bucle. Hay que **excluir** `api.php` (y en su caso la carpeta de la app) de esas redirecciones.

3. **Reglas que reescriben todo**  
   Reglas del tipo “todo lo que no sea un fichero existente va a index.html” pueden hacer que `api.php` sea reenviado y provoque el 508.

## Qué hacer paso a paso

### 1. Confirmar la URL de la app

- Entra siempre por la URL donde está realmente la app, por ejemplo:
  - `https://tu-dominio.com/presup/`
- Comprueba que en esa URL se carga tu `index.html` (pantalla de login de PRESUP), no la página “Loading...” ni otra plantilla de Hostinger.

### 2. Subir y usar el .htaccess de la app

- En la **misma carpeta** donde está `api.php` (por ejemplo `public_html/presup/`) debe estar el `.htaccess` que viene con el proyecto.
- Ese `.htaccess` evita que las peticiones a `api.php` y a otros `.php` sean reescritas y ayuda a evitar el 508 dentro de esa carpeta.

### 3. Revisar el .htaccess de la raíz (public_html)

Si tienes un `.htaccess` en la **raíz** del sitio (por ejemplo `public_html/.htaccess`):

- Abre ese archivo.
- Si hay reglas que redirigen todo (por ejemplo a `index.html` o a una única página), añade **antes** de esas reglas una excepción para la API y, si aplica, para la carpeta de la app.

Ejemplo con `RewriteRule` (Apache):

```apache
# No redirigir api.php ni la carpeta de la app (ajusta "presup" si usas otro nombre)
RewriteCond %{REQUEST_URI} ^/presup/api\.php [OR]
RewriteCond %{REQUEST_URI} ^/presup/
RewriteRule ^ - [L]
```

Así las peticiones a `api.php` y a todo lo que esté bajo `/presup/` no entrarán en la redirección que provoca el 508.

### 4. Si la app está en la raíz

Si `index.html` y `api.php` están directamente en `public_html/` (sin subcarpeta):

- El `.htaccess` que va junto a `api.php` debe estar en `public_html/`.
- En el `.htaccess` de la raíz **no** debe haber ninguna regla que reescriba o redirija `api.php`. Si la hay, coméntala o añade una condición para excluir `api.php` (y en general los `.php`).

### 5. Probar en modo incógnito

- Prueba siempre en una ventana de incógnito para evitar caché del navegador.
- URL a abrir: la misma que hayas definido como correcta (ej. `https://tu-dominio.com/presup/`).

### 6. Contactar con Hostinger

Si tras esto el 508 sigue apareciendo:

- Indica que el error es **508 Loop Detected** al llamar a `api.php`.
- Pregunta si en la cuenta hay alguna redirección o regla global (en el panel o en el servidor) que pueda estar reenviando las peticiones a `api.php` y provocando el bucle.
- Pide que comprueben que las peticiones a `api.php` llegan al PHP y no a otra página (por ejemplo la de “Loading...”).

## Resumen rápido

- Entra **siempre** por la URL donde está la app (ej. `https://tu-dominio.com/presup/`).
- Usa el `.htaccess` que viene con el proyecto en la **misma carpeta** que `api.php`.
- En el `.htaccess` de la **raíz**, excluye `api.php` (y la carpeta de la app) de cualquier redirección que envíe todo a una sola página.
