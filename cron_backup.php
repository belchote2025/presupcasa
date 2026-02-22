<?php
/**
 * Cron: copia de seguridad programada (email y/o webhook a Drive/nube).
 * Ejecutar solo por CLI. Programar cada hora para que compruebe si toca ejecutar:
 *   0 * * * * cd /ruta/a/presup && php cron_backup.php
 * (o cada día a una hora: 0 8 * * * ... si solo usas una hora fija)
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

$now = new DateTime('now');
$currentHour = (int)$now->format('G');
$currentDow = (int)$now->format('w'); // 0=Sunday, 1=Monday, ...
$currentDay = (int)$now->format('j');

$row = null;
try {
    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'backup_schedule'");
    if ($chk->rowCount() === 0) {
        echo "OK; no hay configuración de backup programado.\n";
        exit(0);
    }
    $stmt = $pdo->query("SELECT backup_schedule, backup_schedule_day, backup_schedule_monthday, backup_schedule_hour, backup_email, backup_dest_email, backup_dest_webhook, backup_webhook_url FROM company_settings WHERE id = 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    echo "OK; no se pudo leer configuración.\n";
    exit(0);
}

if (!$row || ($row['backup_schedule'] ?? '') === 'off' || ($row['backup_schedule'] ?? '') === '') {
    exit(0);
}

$sched = trim($row['backup_schedule']);
$schedHour = (int)($row['backup_schedule_hour'] ?? 8);
if ($currentHour !== $schedHour) {
    exit(0);
}

$run = false;
if ($sched === 'daily') {
    $run = true;
} elseif ($sched === 'weekly') {
    $schedDay = (int)($row['backup_schedule_day'] ?? 0);
    $run = ($currentDow === $schedDay);
} elseif ($sched === 'monthly') {
    $schedMonthDay = min(28, max(1, (int)($row['backup_schedule_monthday'] ?? 1)));
    $run = ($currentDay === $schedMonthDay);
}

if (!$run) {
    exit(0);
}

$backup = [
    'date' => $now->format('Y-m-d H:i:s'),
    'quotes' => [],
    'invoices' => [],
    'customers' => [],
    'expenses' => [],
    'appointments' => []
];
try {
    $backup['quotes'] = $pdo->query("SELECT * FROM quotes ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
    $backup['invoices'] = $pdo->query("SELECT * FROM invoices ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
    $backup['customers'] = $pdo->query("SELECT * FROM customers ORDER BY name")->fetchAll(PDO::FETCH_ASSOC);
    $backup['expenses'] = $pdo->query("SELECT * FROM expenses ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
    $backup['appointments'] = $pdo->query("SELECT * FROM appointments ORDER BY date")->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    fwrite(STDERR, "Error generando backup: " . $e->getMessage() . "\n");
    exit(1);
}

$json = json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
$filename = 'backup_presup_' . $now->format('Y-m-d_His') . '.json';

$destEmail = (int)($row['backup_dest_email'] ?? 1);
$to = trim($row['backup_email'] ?? '');
if ($destEmail && $to !== '' && filter_var($to, FILTER_VALIDATE_EMAIL)) {
    $cfg = $pdo->query("SELECT email, sender_name FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
    $fromEmail = $cfg['email'] ?? 'noreply@' . (gethostname() ?: 'localhost');
    $fromName = $cfg['sender_name'] ?? null;
    $fromHeader = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
    $boundary = md5(uniqid());
    $headers = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{$boundary}\"\r\nFrom: {$fromHeader}\r\n";
    $msg = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . base64_encode("Copia de seguridad programada PRESUNAVEGATEL " . $now->format('d/m/Y H:i')) . "\r\n";
    $msg .= "--{$boundary}\r\nContent-Type: application/json; name=\"{$filename}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n" . base64_encode($json) . "\r\n--{$boundary}--";
    @mail($to, "Copia de seguridad PRESUNAVEGATEL " . $now->format('d/m/Y'), $msg, $headers);
}

$destWebhook = (int)($row['backup_dest_webhook'] ?? 0);
$webhookUrl = trim($row['backup_webhook_url'] ?? '');
if ($destWebhook && $webhookUrl !== '' && preg_match('#^https?://#i', $webhookUrl)) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $json,
            'timeout' => 30
        ]
    ]);
    @file_get_contents($webhookUrl, false, $ctx);
}

echo "OK; backup programado ejecutado.\n";
exit(0);
