<?php
/**
 * Añade la columna document_footer a company_settings (pie de página editable del documento).
 * Ejecutar UNA VEZ: en navegador o CLI: php add_document_footer.php
 * Luego puedes borrar este archivo por seguridad.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Pie de página editable</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} p{margin:0.4rem 0;}</style></head><body><h2>Migración: pie de página editable</h2>";
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

try {
    $stmt = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'document_footer'");
    if ($stmt->rowCount() > 0) {
        msg("La columna document_footer ya existe en company_settings. No hace falta hacer nada.");
    } else {
        $pdo->exec("ALTER TABLE company_settings ADD COLUMN document_footer TEXT NULL DEFAULT NULL AFTER backup_email");
        msg("Columna document_footer creada correctamente en company_settings.");
    }
} catch (PDOException $e) {
    msg("Error: " . $e->getMessage(), true);
}

if (!$isCli) echo '</body></html>';
