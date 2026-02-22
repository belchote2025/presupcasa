<?php
/**
 * Cron: procesar facturas recurrentes (generar nuevas según próxima fecha).
 * Ejecutar solo por CLI: php cron_process_recurring.php
 * Programar en el sistema (ej. cada día a las 8:00):
 *   0 8 * * * cd /ruta/a/presup && php cron_process_recurring.php
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Solo permitida ejecución por línea de comandos (CLI).');
}

$baseDir = __DIR__;
$isLocal = file_exists($baseDir . '/.cron_local') || getenv('PRESUP_CRON_LOCAL') === '1';

if ($isLocal) {
    $host = getenv('DB_HOST') ?: 'localhost';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASS') ?: '';
    $db   = getenv('DB_NAME') ?: 'presunavegatel';
    $port = (int)(getenv('DB_PORT') ?: 3306);
} else {
    $host = getenv('DB_HOST') ?: 'localhost';
    $user = getenv('DB_USER');
    $pass = getenv('DB_PASS');
    $db   = getenv('DB_NAME');
    $port = (int)(getenv('DB_PORT') ?: 3306);
    if (empty($db) || empty($user)) {
        $code = @file_get_contents($baseDir . '/api.php');
        if ($code && preg_match('/\$host\s*=\s*["\']([^"\']+)["\']/', $code, $m)) $host = $m[1];
        if ($code && preg_match('/\$user\s*=\s*["\']([^"\']+)["\']/', $code, $m)) $user = $m[1];
        if ($code && preg_match('/\$pass\s*=\s*["\']([^"\']*)["\']/', $code, $m)) $pass = $m[1];
        if ($code && preg_match('/\$db\s*=\s*["\']([^"\']+)["\']/', $code, $m))   $db   = $m[1];
    }
}

try {
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 15,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
} catch (Exception $e) {
    fwrite(STDERR, "Error conexión DB: " . $e->getMessage() . "\n");
    exit(1);
}

$created = 0;
$updated = 0;

try {
    $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'is_recurring'");
    if ($chk->rowCount() === 0) {
        fwrite(STDERR, "La tabla invoices no tiene columnas de recurrencia.\n");
        exit(0);
    }
    $stmt = $pdo->prepare("
        SELECT * FROM invoices
        WHERE is_recurring = 1
          AND next_date IS NOT NULL
          AND next_date <= CURDATE()
    ");
    $stmt->execute();
    $rec = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$rec) {
        echo "OK; no hay facturas recurrentes pendientes.\n";
        exit(0);
    }
    foreach ($rec as $r) {
        $pdo->beginTransaction();
        $freq = strtolower(trim($r['recurrence_frequency'] ?? 'monthly'));
        $interval = "1 MONTH";
        if ($freq === 'quarterly') $interval = "3 MONTH";
        elseif ($freq === 'yearly' || $freq === 'annual') $interval = "1 YEAR";
        $newId = 'FAC-' . date('YmdHis') . '-' . mt_rand(100, 999);
        $ins = $pdo->prepare("
            INSERT INTO invoices
            (id, quote_id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount, is_recurring, recurrence_frequency, next_date)
            VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, NULL, NULL)
        ");
        $ins->execute([
            $newId,
            $r['quote_id'] ?? null,
            $r['client_name'] ?? null,
            $r['client_id'] ?? null,
            $r['client_address'] ?? null,
            $r['client_email'] ?? null,
            $r['client_phone'] ?? null,
            $r['notes'] ?? null,
            $r['user_id'] ?? null,
            $r['subtotal'] ?? 0,
            $r['tax_amount'] ?? 0,
            $r['total_amount'] ?? 0
        ]);
        $itemsStmt = $pdo->prepare("SELECT description, image_url, quantity, price, tax_percent FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC");
        $itemsStmt->execute([$r['id']]);
        $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
        if ($items) {
            $insItems = $pdo->prepare("INSERT INTO invoice_items (invoice_id, description, image_url, quantity, price, tax_percent) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($items as $it) {
                $insItems->execute([
                    $newId,
                    $it['description'] ?? '',
                    $it['image_url'] ?? null,
                    $it['quantity'] ?? 1,
                    $it['price'] ?? 0,
                    $it['tax_percent'] ?? 0
                ]);
            }
        }
        $upd = $pdo->prepare("UPDATE invoices SET next_date = DATE_ADD(next_date, INTERVAL $interval) WHERE id = ?");
        $upd->execute([$r['id']]);
        try {
            $stmtLog = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'create', 0, 'cron', ?)");
            $stmtLog->execute(['invoices', $newId, json_encode(["Factura recurrente generada desde {$r['id']}"], JSON_UNESCAPED_UNICODE)]);
        } catch (Exception $e) { }
        $pdo->commit();
        $created++;
        $updated++;
    }
    echo "OK; creadas: $created, actualizadas: $updated.\n";
    exit(0);
} catch (Exception $e) {
    try { $pdo->rollBack(); } catch (Exception $e2) {}
    fwrite(STDERR, "Error: " . $e->getMessage() . "\n");
    if (!is_dir($baseDir . '/logs')) @mkdir($baseDir . '/logs', 0755, true);
    @file_put_contents($baseDir . '/logs/cron.log', date('Y-m-d H:i:s') . " process_recurring: " . $e->getMessage() . "\n", FILE_APPEND | LOCK_EX);
    exit(1);
}
