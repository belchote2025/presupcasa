<?php
/**
 * Diagnóstico 508 Loop - NAVEGA360PRO
 * Sube este archivo a la raíz de public_html y abre: https://tu-dominio.com/check_508.php
 * No modifica nada; solo muestra información para localizar el problema.
 */
header('Content-Type: text/html; charset=utf-8');
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$scriptFilename = $_SERVER['SCRIPT_FILENAME'] ?? '';
$htaccessPath = rtrim($docRoot, '/') . '/.htaccess';
$htaccessExists = $docRoot && file_exists($htaccessPath);
$htaccessContent = $htaccessExists ? file_get_contents($htaccessPath) : '(no existe o no legible)';
$apiPath = rtrim($docRoot, '/') . '/api.php';
$apiExists = $docRoot && file_exists($apiPath);

$recommended = '# Copia este contenido en public_html/.htaccess (raíz)
# PRODUCCIÓN - App en la RAÍZ

<IfModule mod_rewrite.c>
RewriteEngine On
# PRIMERO: no tocar api.php ni ningún .php (evita 508)
RewriteCond %{REQUEST_URI} ^/api\.php [OR]
RewriteCond %{REQUEST_URI} \.php$
RewriteRule ^ - [L]
# No reescribir archivos ni carpetas existentes
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
</IfModule>

<IfModule mod_reqtimeout.c>
RequestReadTimeout header=20-40,MinRate=500 body=20,MinRate=500
</IfModule>

<FilesMatch "api\.php">
Header set Content-Type "application/json; charset=utf-8"
</FilesMatch>';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnóstico 508 - NAVEGA360PRO</title>
    <style>
        body { font-family: sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; background: #1e293b; color: #e2e8f0; }
        h1 { color: #f8fafc; font-size: 1.25rem; }
        .ok { color: #22c55e; }
        .warn { color: #eab308; }
        .err { color: #ef4444; }
        pre, code { background: #0f172a; padding: 0.5rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
        pre { white-space: pre-wrap; }
        .block { margin: 1rem 0; padding: 1rem; border: 1px solid #334155; border-radius: 6px; }
        a { color: #38bdf8; }
        button { background: #3b82f6; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; margin-top: 0.5rem; }
        button:hover { background: #2563eb; }
        #test-result { margin-top: 0.5rem; }
    </style>
</head>
<body>
    <h1>Diagnóstico 508 Loop – NAVEGA360PRO</h1>
    <p>Si la app está en la <strong>raíz</strong> y ves 508, el servidor está reescribiendo <code>api.php</code>. Este script te ayuda a comprobarlo.</p>

    <div class="block">
        <h2>1. Servidor (este script sí carga)</h2>
        <ul>
            <li><strong>REQUEST_URI:</strong> <code><?php echo htmlspecialchars($requestUri); ?></code></li>
            <li><strong>SCRIPT_NAME:</strong> <code><?php echo htmlspecialchars($scriptName); ?></code></li>
            <li><strong>DOCUMENT_ROOT:</strong> <code><?php echo htmlspecialchars($docRoot); ?></code></li>
            <li><strong>api.php existe en raíz:</strong> <?php echo $apiExists ? '<span class="ok">Sí</span>' : '<span class="err">No</span>'; ?></li>
            <li><strong>.htaccess existe en raíz:</strong> <?php echo $htaccessExists ? '<span class="ok">Sí</span>' : '<span class="warn">No</span>'; ?></li>
        </ul>
    </div>

    <div class="block">
        <h2>2. Contenido actual de .htaccess (raíz)</h2>
        <?php if ($htaccessExists): ?>
        <pre><?php echo htmlspecialchars($htaccessContent); ?></pre>
        <p class="warn">Si ves reglas que reescriben todo a <code>index.php</code> o similar sin excluir <code>api.php</code>, ahí está el 508.</p>
        <?php else: ?>
        <p>No hay .htaccess en la raíz. Si el hosting tiene uno por defecto que reescribe URLs, puede estar causando el 508.</p>
        <?php endif; ?>
    </div>

    <div class="block">
        <h2>3. Prueba de api.php desde aquí</h2>
        <p>Al pulsar el botón se hace una petición a <code>api.php?action=get_settings</code>. Si devuelve 508, el problema es el .htaccess (o el del panel de Hostinger).</p>
        <button type="button" id="btn-test">Probar api.php ahora</button>
        <div id="test-result"></div>
    </div>

    <div class="block">
        <h2>4. .htaccess recomendado (raíz)</h2>
        <p>Copia el siguiente contenido en <strong>public_html/.htaccess</strong> (sustituye todo el contenido si ya existe). Lo importante es que <code>api.php</code> y cualquier <code>.php</code> <strong>no se reescriban</strong>.</p>
        <pre><?php echo htmlspecialchars($recommended); ?></pre>
        <p>En Hostinger: Administrador de archivos → <code>public_html</code> → editar o crear <code>.htaccess</code>.</p>
    </div>

    <div class="block">
        <h2>5. Comprobar redirecciones en el panel</h2>
        <p>En el panel de Hostinger (o tu hosting) revisa <strong>Dominios → Redirecciones</strong>. No debe haber una redirección que envíe <code>/api.php</code> a otra URL (eso puede provocar un bucle).</p>
    </div>

    <script>
        document.getElementById('btn-test').onclick = function () {
            var result = document.getElementById('test-result');
            result.innerHTML = 'Probando...';
            var url = (window.location.pathname.replace(/\/[^/]*$/, '') || '') + (window.location.pathname.indexOf('/') === 0 && window.location.pathname.length > 1 ? '' : '/') + 'api.php?action=get_settings&t=' + Date.now();
            if (!url.match(/\/api\.php/)) url = 'api.php?action=get_settings&t=' + Date.now();
            fetch(url, { method: 'GET', credentials: 'same-origin' })
                .then(function (r) {
                    if (r.status === 508) {
                        result.innerHTML = '<span class="err">508 recibido. El .htaccess (o una regla del servidor) está reescribiendo api.php. Usa el .htaccess recomendado arriba en public_html.</span>';
                    } else if (r.ok) {
                        result.innerHTML = '<span class="ok">HTTP ' + r.status + '. La API responde bien desde esta URL. Si la app sigue mostrando 508, limpia caché y recarga (Ctrl+F5).</span>';
                    } else {
                        result.innerHTML = '<span class="warn">HTTP ' + r.status + '. La API no devolvió 200. Revisa que api.php exista en la raíz.</span>';
                    }
                })
                .catch(function (e) {
                    result.innerHTML = '<span class="err">Error: ' + (e.message || 'No se pudo conectar') + '. Comprueba la consola (F12).</span>';
                });
        };
    </script>
</body>
</html>
