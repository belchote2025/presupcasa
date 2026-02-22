<?php
/**
 * Soporte multi-empresa: tabla companies, current_company_id, company_id en entidades.
 * Ejecutar UNA VEZ: en navegador o CLI: php add_multi_company.php
 * Luego borrar este archivo por seguridad.
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Multi-empresa</title>";
    echo "<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px;} .ok{color:#0a0;} .err{color:#c00;} p{margin:0.4rem 0;}</style></head><body><h2>Migración: multi-empresa</h2>";
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

// 1. Tabla companies (copia estructura de company_settings)
try {
    $pdo->query("SELECT 1 FROM companies LIMIT 1");
    msg("La tabla companies ya existe.");
} catch (PDOException $e) {
    $pdo->exec("CREATE TABLE companies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255),
        cif VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        default_tax DECIMAL(5,2) DEFAULT 21,
        vendomia_api_key VARCHAR(255) NULL,
        sender_name VARCHAR(255) NULL,
        document_language VARCHAR(10) NULL DEFAULT 'es',
        payment_link_url VARCHAR(500) NULL,
        payment_enabled TINYINT(1) NULL DEFAULT 0,
        backup_email VARCHAR(255) NULL,
        document_footer TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    msg("Tabla companies creada.");
}

// 2. Copiar datos de company_settings a companies si está vacía
try {
    $n = $pdo->query("SELECT COUNT(*) FROM companies")->fetchColumn();
    if ($n == 0) {
        $pdo->exec("INSERT INTO companies (id, name, cif, email, address, default_tax) SELECT id, name, cif, email, address, default_tax FROM company_settings WHERE id = 1");
        foreach (['vendomia_api_key','sender_name','document_language','payment_link_url','payment_enabled','backup_email','document_footer'] as $col) {
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE '$col'");
                if ($chk->rowCount() > 0) {
                    $chk2 = $pdo->query("SHOW COLUMNS FROM companies LIKE '$col'");
                    if ($chk2->rowCount() > 0)
                        $pdo->exec("UPDATE companies c JOIN company_settings s ON s.id = 1 SET c.$col = s.$col WHERE c.id = 1");
                }
            } catch (PDOException $e) { }
        }
        msg("Datos de empresa copiados a companies.");
    } else {
        msg("companies ya tiene datos.");
    }
} catch (PDOException $e) {
    msg("Copiar datos: " . $e->getMessage(), true);
}

// 3. current_company_id en company_settings
try {
    $stmt = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'current_company_id'");
    if ($stmt->rowCount() > 0) msg("company_settings.current_company_id ya existe.");
    else {
        $pdo->exec("ALTER TABLE company_settings ADD COLUMN current_company_id INT NULL DEFAULT 1 AFTER id");
        $pdo->exec("UPDATE company_settings SET current_company_id = 1 WHERE id = 1");
        msg("Columna current_company_id añadida.");
    }
} catch (PDOException $e) {
    msg("current_company_id: " . $e->getMessage(), true);
}

// 4. company_id en customers, quotes, invoices, appointments, expenses
foreach (['customers', 'quotes', 'invoices', 'appointments', 'expenses'] as $table) {
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM $table LIKE 'company_id'");
        if ($stmt->rowCount() > 0) msg("$table.company_id ya existe.");
        else {
            $pdo->exec("ALTER TABLE $table ADD COLUMN company_id INT NULL DEFAULT 1");
            $pdo->exec("UPDATE $table SET company_id = 1 WHERE company_id IS NULL");
            msg("$table.company_id creado.");
        }
    } catch (PDOException $e) {
        msg("$table.company_id: " . $e->getMessage(), true);
    }
}

if (!$isCli) echo '</body></html>';
