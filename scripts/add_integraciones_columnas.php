<?php
/**
 * Añade columnas para integraciones: Email, Pagos, Idioma, Backup, Firma.
 * Ejecutar UNA VEZ: en navegador o CLI: php add_integraciones_columnas.php
 * Luego puedes borrar este archivo por seguridad.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Integraciones - Columnas</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} p{margin:0.4rem 0;}</style></head><body><h2>Migración integraciones</h2>";
}

function msg($s, $err = false) {
    global $isCli;
    if ($isCli) echo $s . "\n";
    else echo '<p class="' . ($err ? 'err' : 'ok') . '">' . htmlspecialchars($s) . '</p>';
}

if ($isCli || in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'])) {
    $host = 'localhost'; $user = 'root'; $pass = ''; $db = 'presunavegatel'; $port = 3306;
} else {
    $host = 'localhost'; $user = 'u600265163_HAggBlS0j_presupadmin'; $pass = 'Belchote1@'; $db = 'u600265163_HAggBlS0j_presup'; $port = 3306;
}

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (PDOException $e) {
    msg('Error de conexión: ' . $e->getMessage(), true);
    if (!$isCli) echo '</body></html>';
    exit(1);
}

$columns_settings = [
    'sender_name' => "ADD COLUMN sender_name VARCHAR(255) NULL DEFAULT NULL AFTER default_tax",
    'document_language' => "ADD COLUMN document_language VARCHAR(10) NULL DEFAULT 'es' AFTER sender_name",
    'payment_link_url' => "ADD COLUMN payment_link_url VARCHAR(500) NULL DEFAULT NULL AFTER document_language",
    'payment_enabled' => "ADD COLUMN payment_enabled TINYINT(1) NULL DEFAULT 0 AFTER payment_link_url",
    'backup_email' => "ADD COLUMN backup_email VARCHAR(255) NULL DEFAULT NULL AFTER payment_enabled",
];

foreach ($columns_settings as $col => $sql) {
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM company_settings LIKE '$col'");
        if ($stmt->rowCount() > 0) {
            msg("company_settings.$col ya existe.");
        } else {
            $pdo->exec("ALTER TABLE company_settings " . $sql);
            msg("Columna company_settings.$col creada.");
        }
    } catch (PDOException $e) {
        msg("company_settings.$col: " . $e->getMessage(), true);
    }
}

try {
    $stmt = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'quote_signature'");
    if ($stmt->rowCount() > 0) {
        msg("quotes.quote_signature ya existe.");
    } else {
        $pdo->exec("ALTER TABLE quotes ADD COLUMN quote_signature TEXT NULL DEFAULT NULL AFTER notes");
        msg("Columna quotes.quote_signature creada.");
    }
} catch (PDOException $e) {
    msg("quotes.quote_signature: " . $e->getMessage(), true);
}

msg('Listo. Borra este archivo (add_integraciones_columnas.php) por seguridad.');
if (!$isCli) echo '<p><a href="index.html">Ir a la app</a></p></body></html>';
