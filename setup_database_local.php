<?php
/**
 * Script para crear la base de datos en LOCAL (XAMPP).
 * Crea la base "presunavegatel" y ejecuta el esquema de database.sql.
 *
 * Uso: abrir en el navegador http://localhost/presup/setup_database_local.php
 * O: php setup_database_local.php (por línea de comandos)
 *
 * Requisitos: MySQL/MariaDB con usuario root sin contraseña (por defecto XAMPP).
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = php_sapi_name() === 'cli';
function out($msg, $eol = true) {
    global $isCli;
    echo $msg . ($eol ? ($isCli ? "\n" : "<br>") : '');
}

// Solo permitir ejecución en local
if (!$isCli && $_SERVER['REMOTE_ADDR'] !== '127.0.0.1' && $_SERVER['REMOTE_ADDR'] !== '::1') {
    header('HTTP/1.1 403 Forbidden');
    die('Este script solo puede ejecutarse en localhost.');
}

if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Setup BD local</title></head><body><pre style='font-family:monospace;'>";
}

out("=== Setup base de datos LOCAL (presunavegatel) ===");
out("");

$host = 'localhost';
$user = 'root';
$pass = '';
$dbName = 'presunavegatel';
$port = 3306;

try {
    // Conectar sin base de datos para crear la BD
    $dsn = "mysql:host=$host;port=$port;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    out("Conexión a MySQL: OK");

    // Crear base de datos si no existe
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    out("Base de datos '$dbName': creada o ya existía.");
    $pdo->exec("USE `$dbName`");

    // Cargar y ejecutar database.sql (sin CREATE DATABASE / USE)
    $sqlFile = __DIR__ . DIRECTORY_SEPARATOR . 'database.sql';
    if (!is_readable($sqlFile)) {
        throw new Exception("No se encuentra o no se puede leer: database.sql");
    }
    $sql = file_get_contents($sqlFile);
    // Quitar comentarios de línea (-- ...) para evitar ejecutar líneas comentadas con ;
    $sql = preg_replace('/--[^\n]*/u', '', $sql);
    // Dividir por ; seguido de salto de línea (sentencias)
    $statements = array_filter(
        array_map('trim', preg_split('/;\s*[\r\n]+/u', $sql)),
        function ($s) { return $s !== '' && !preg_match('/^\s*$/u', $s); }
    );

    $ok = 0;
    $err = 0;
    foreach ($statements as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try {
            $pdo->exec($stmt);
            $ok++;
        } catch (PDOException $e) {
            // Ignorar "Duplicate column" o "already exists" si estamos actualizando
            if (strpos($e->getMessage(), 'Duplicate') !== false || strpos($e->getMessage(), 'already exists') !== false) {
                $ok++;
            } else {
                $err++;
                out("  [!] " . $e->getMessage());
            }
        }
    }
    out("Sentencias ejecutadas: $ok (errores no críticos: $err)");
    out("");

    // Comprobar tablas
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $expected = ['users', 'company_settings', 'customers', 'catalog', 'quotes', 'quote_items', 'appointments', 'invoices', 'invoice_items', 'expenses', 'projects', 'project_tasks', 'deletion_requests'];
    $missing = array_diff($expected, $tables);
    if (!empty($missing)) {
        out("Advertencia: tablas no encontradas: " . implode(', ', $missing));
    } else {
        out("Tablas verificadas: " . count($tables) . " tablas.");
    }

    $admin = $pdo->query("SELECT id, username, role FROM users WHERE username = 'admin'")->fetch(PDO::FETCH_ASSOC);
    if ($admin) {
        out("Usuario por defecto: admin / admin123 (cámbialo en producción).");
    }
    out("");
    out("=== Base de datos lista para usar en local. ===");
    out("Puedes verificar con: check_database.php");
} catch (PDOException $e) {
    out("ERROR: " . $e->getMessage());
    out("Comprueba que XAMPP MySQL esté iniciado y que root no tenga contraseña (o edita \$pass en este script).");
    exit(1);
} catch (Exception $e) {
    out("ERROR: " . $e->getMessage());
    exit(1);
}

if (!$isCli) {
    echo "</pre></body></html>";
}
