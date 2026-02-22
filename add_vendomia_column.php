<?php
/**
 * Añade la columna vendomia_api_key a company_settings (para integración Vendomia).
 * Ejecutar UNA VEZ: en navegador https://tu-dominio.com/presup/add_vendomia_column.php
 * o por CLI: php add_vendomia_column.php
 * Luego puedes borrar este archivo por seguridad.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Vendomia - Añadir columna API key</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} p{margin:0.5rem 0;}</style></head><body><h2>Integración Vendomia – Añadir columna API key</h2>";
}

function msg($s, $err = false) {
    global $isCli;
    if ($isCli) echo $s . "\n";
    else echo '<p class="' . ($err ? 'err' : 'ok') . '">' . htmlspecialchars($s) . '</p>';
}

// Conexión BD (mismo criterio que api.php)
if ($isCli || in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'])) {
    $host = 'localhost'; $user = 'root'; $pass = ''; $db = 'presunavegatel'; $port = 3306;
} else {
    $host = 'localhost'; $user = 'u600265163_HAggBlS0j_presupadmin'; $pass = 'Belchote1@'; $db = 'u600265163_HAggBlS0j_presup'; $port = 3306;
}

try {
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
} catch (PDOException $e) {
    msg('Error de conexión: ' . $e->getMessage(), true);
    if (!$isCli) echo '</body></html>';
    exit(1);
}

try {
    $stmt = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'vendomia_api_key'");
    if ($stmt->rowCount() > 0) {
        msg('La columna vendomia_api_key ya existe en company_settings. No hace falta hacer nada.');
    } else {
        $pdo->exec("ALTER TABLE company_settings ADD COLUMN vendomia_api_key VARCHAR(255) NULL DEFAULT NULL AFTER default_tax");
        msg('Columna vendomia_api_key creada correctamente en company_settings.');
    }
} catch (PDOException $e) {
    msg('Error: ' . $e->getMessage(), true);
    if (!$isCli) echo '</body></html>';
    exit(1);
}

msg('Listo. Ya puedes guardar la API key de Vendomia en Configuración. Borra este archivo (add_vendomia_column.php) por seguridad.');
if (!$isCli) echo '<p><a href="index.html">Ir a la app</a></p></body></html>';
