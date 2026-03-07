<?php
/**
 * diagnostico_produccion.php
 *
 * Script de ayuda para producción (Hostinger u otros).
 *
 * Qué hace:
 * 1. Comprueba que api.php existe en ESTA carpeta.
 * 2. Comprueba/crea un .htaccess recomendado en ESTA carpeta (no toca otras rutas).
 * 3. Lanza una petición HTTP a api.php?action=get_settings y muestra:
 *    - Código HTTP
 *    - Primeros caracteres de la respuesta
 *
 * Uso:
 * - Sube este archivo a la misma carpeta donde está index.html en producción (normalmente public_html/).
 * - Abre en el navegador: https://tu-dominio.com/diagnostico_produccion.php
 * - Copia el resultado si necesitas enviarlo al soporte del hosting.
 */

header('Content-Type: text/html; charset=utf-8');

$root = __DIR__;
$apiPath = $root . '/api.php';
$htaccessPath = $root . '/.htaccess';

function h($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

echo "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\"><title>Diagnóstico producción NAVEGA360PRO</title>";
echo "<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e5e7eb;padding:1.5rem;}h1{font-size:1.5rem;margin-bottom:1rem;}pre{background:#020617;border-radius:6px;padding:0.75rem;white-space:pre-wrap;word-break:break-all;} .ok{color:#4ade80;} .err{color:#f97373;} .warn{color:#facc15;} .box{border:1px solid #1f2937;border-radius:8px;padding:1rem;margin-bottom:1rem;background:#020617;} code{background:#111827;padding:0.1rem 0.25rem;border-radius:4px;font-size:0.9em;}</style>";
echo "</head><body>";
echo "<h1>Diagnóstico producción – NAVEGA360PRO</h1>";

// 1) api.php existe
echo "<div class=\"box\"><h2>1. api.php en esta carpeta</h2>";
if (is_file($apiPath)) {
    echo "<p class=\"ok\">OK: <code>api.php</code> existe en " . h($root) . "</p>";
} else {
    echo "<p class=\"err\">ERROR: No se encuentra <code>api.php</code> en " . h($root) . ".</p>";
    echo "<p>Sube el archivo <code>api.php</code> de tu proyecto a esta carpeta y vuelve a cargar esta página.</p>";
}
echo "</div>";

// 2) .htaccess recomendado en ESTA carpeta (no toca subdirectorios)
echo "<div class=\"box\"><h2>2. .htaccess en esta carpeta</h2>";
$recommendedHtaccess = <<<HT
# NAVEGA360PRO - .htaccess recomendado en esta carpeta

<IfModule mod_rewrite.c>
    RewriteEngine On
    # No reescribir api.php ni otros .php (evita loops 508 dentro de esta carpeta)
    RewriteCond %{REQUEST_URI} \\.php$ [OR]
    RewriteCond %{REQUEST_URI} api\\.php
    RewriteRule ^ - [L]

    # No reescribir archivos ni directorios existentes
    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [L]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]
</IfModule>

<FilesMatch "api\\.php">
    Header set Content-Type "application/json; charset=utf-8"
</FilesMatch>

HT;

if (file_exists($htaccessPath)) {
    $current = file_get_contents($htaccessPath);
    echo "<p>Se ha encontrado un <code>.htaccess</code> en esta carpeta.</p>";
    echo "<details><summary style=\"cursor:pointer;color:#93c5fd;\">Ver contenido actual</summary><pre>" . h($current) . "</pre></details>";
} else {
    echo "<p class=\"warn\">No hay <code>.htaccess</code> en esta carpeta. Se va a crear uno recomendado para evitar reescrituras de <code>api.php</code> aquí.</p>";
    file_put_contents($htaccessPath, $recommendedHtaccess);
    echo "<p class=\"ok\">Creado <code>.htaccess</code> recomendado.</p>";
}

echo "<details><summary style=\"cursor:pointer;color:#93c5fd;\">Ver .htaccess recomendado</summary><pre>" . h($recommendedHtaccess) . "</pre></details>";
echo "</div>";

// 3) Probar llamada HTTP a api.php?action=get_settings
echo "<div class=\"box\"><h2>3. Prueba HTTP a api.php?action=get_settings</h2>";

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$baseUri = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
if ($baseUri === '' || $baseUri === '\\') $baseUri = '';
$testUrl = $scheme . '://' . $host . $baseUri . '/api.php?action=get_settings&t=' . time();

echo "<p>URL probada: <code>" . h($testUrl) . "</code></p>";

// Usar stream_context simple para no depender de cURL
$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "Accept: application/json\r\nUser-Agent: PRESUP-diagnostico/1.0\r\n",
        'timeout' => 10,
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ],
]);

set_error_handler(function () { /* silenciar warnings */ });
$response = @file_get_contents($testUrl, false, $ctx);
restore_error_handler();

$statusLine = null;
if (!empty($http_response_header) && is_array($http_response_header)) {
    foreach ($http_response_header as $hline) {
        if (stripos($hline, 'HTTP/') === 0) {
            $statusLine = $hline;
            break;
        }
    }
}

if ($statusLine) {
    echo "<p><strong>Código devuelto por api.php:</strong> <code>" . h($statusLine) . "</code></p>";
} else {
    echo "<p class=\"warn\">No se pudo obtener la línea de estado HTTP. Puede que la petición haya sido interceptada antes de llegar a PHP.</p>";
}

if ($response === false) {
    echo "<p class=\"err\">No se pudo leer respuesta de <code>api.php</code>. Si el código arriba es 508 o 405, el problema está en reglas del servidor fuera de esta carpeta (redirecciones globales, proxy, etc.).</p>";
} else {
    $snippet = mb_substr($response, 0, 400, 'UTF-8');
    echo "<p>Primeros caracteres de la respuesta:</p><pre>" . h($snippet) . (strlen($response) > 400 ? "\n...\n(truncado)" : "") . "</pre>";
    if (strpos($snippet, '<!DOCTYPE') !== false || stripos($snippet, '<html') !== false) {
        echo "<p class=\"warn\">Parece HTML, no JSON. Eso indica que algo (otra capa del servidor) está devolviendo una página en lugar de la respuesta de <code>api.php</code>.</p>";
    }
}

echo "</div>";

echo "<div class=\"box\"><h2>4. Qué hacer con este resultado</h2>";
echo "<ul>";
echo "<li>Si ves <span class=\"ok\">HTTP 200</span> y la respuesta empieza por <code>{</code>, la API responde bien desde esta carpeta.</li>";
echo "<li>Si ves <span class=\"err\">508</span> o <span class=\"err\">405</span> en la línea de estado, copia esta página y envíasela al soporte del hosting: significa que el servidor está interceptando <code>api.php</code> antes de llegar a tu código.</li>";
echo "<li>Si la respuesta es HTML (\"Loading...\" o similar), también es señal de que otra capa (proxy, CDN, página de mantenimiento) está respondiendo en lugar de tu API.</li>";
echo "</ul>";
echo "</div>";

echo "</body></html>";

