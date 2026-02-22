<?php
/**
 * Añade columnas a customers: notes, category, lead_source, birthday.
 * Ejecutar UNA VEZ: en navegador o CLI: php add_customers_extra.php
 * Luego puedes borrar este archivo por seguridad.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Clientes - Notas, categoría, origen, cumpleaños</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} p{margin:0.4rem 0;}</style></head><body><h2>Migración: clientes (notas, categoría, origen, cumpleaños)</h2>";
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

$columns = [
    'notes' => "ADD COLUMN notes TEXT NULL DEFAULT NULL AFTER phone",
    'category' => "ADD COLUMN category VARCHAR(50) NULL DEFAULT NULL AFTER notes",
    'lead_source' => "ADD COLUMN lead_source VARCHAR(100) NULL DEFAULT NULL AFTER category",
    'birthday' => "ADD COLUMN birthday DATE NULL DEFAULT NULL AFTER lead_source",
];

foreach ($columns as $col => $sql) {
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM customers LIKE '$col'");
        if ($stmt->rowCount() > 0) {
            msg("customers.$col ya existe.");
        } else {
            $pdo->exec("ALTER TABLE customers " . $sql);
            msg("Columna customers.$col creada.");
        }
    } catch (PDOException $e) {
        msg("customers.$col: " . $e->getMessage(), true);
    }
}

if (!$isCli) echo '</body></html>';
