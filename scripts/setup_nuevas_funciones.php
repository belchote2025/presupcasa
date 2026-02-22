<?php
/**
 * Configuración única: crea carpeta logs, tabla password_reset_tokens y tabla audit_log.
 * Ejecutar una vez: desde navegador (http://tu-dominio/setup_nuevas_funciones.php) o CLI: php setup_nuevas_funciones.php
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Setup - Nuevas funciones</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} pre{background:#f0f0f0;padding:10px;}</style></head><body><h2>Setup nuevas funciones</h2>";
}

function msg($s, $isError = false) {
    global $isCli;
    if ($isCli) echo $s . "\n";
    else echo '<p class="' . ($isError ? 'err' : 'ok') . '">' . htmlspecialchars($s) . '</p>';
}

// 1. Crear carpeta logs
$logsDir = __DIR__ . '/logs';
if (!is_dir($logsDir)) {
    if (@mkdir($logsDir, 0755, true)) {
        msg('Carpeta logs/ creada.');
    } else {
        msg('No se pudo crear la carpeta logs/. Créala manualmente con permisos 755.', true);
    }
} else {
    msg('Carpeta logs/ ya existe.');
}

// 2. Conexión BD (mismo criterio que api.php)
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
    msg('Error de conexión a la base de datos: ' . $e->getMessage(), true);
    if (!$isCli) echo '</body></html>';
    exit(1);
}

// 3. Tabla password_reset_tokens
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    msg('Tabla password_reset_tokens creada o ya existía.');
} catch (PDOException $e) {
    msg('Error al crear password_reset_tokens: ' . $e->getMessage(), true);
}

// 4. Tabla audit_log
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id INT PRIMARY KEY AUTO_INCREMENT,
        table_name VARCHAR(50) NOT NULL,
        record_id VARCHAR(50) NOT NULL,
        action ENUM('create', 'update', 'delete') NOT NULL,
        user_id INT,
        username VARCHAR(50),
        changes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_table_record (table_name, record_id),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )");
    msg('Tabla audit_log creada o ya existía.');
} catch (PDOException $e) {
    msg('Error al crear audit_log: ' . $e->getMessage(), true);
}

// 5. Columna Vendomia API key (si no existe)
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'vendomia_api_key'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE company_settings ADD COLUMN vendomia_api_key VARCHAR(255) NULL DEFAULT NULL AFTER default_tax");
        msg('Columna vendomia_api_key añadida a company_settings.');
    } else {
        msg('Columna vendomia_api_key ya existe.');
    }
} catch (PDOException $e) {
    msg('Vendomia API key (opcional): ' . $e->getMessage(), true);
}

msg('Setup completado. Puedes borrar este archivo (setup_nuevas_funciones.php) por seguridad.');
if (!$isCli) echo '</body></html>';
