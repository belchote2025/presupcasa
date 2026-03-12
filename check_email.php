<?php
/**
 * Comprobar en vivo que la configuración de email (SMTP) es correcta.
 * Funciona sin necesidad de estar logueado (solo en localhost).
 * Uso: abre check_email.php, escribe un email y pulsa "Enviar prueba".
 */
error_reporting(E_ALL);
ini_set('display_errors', 0);

$result = null;
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);

if ($isLocal && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $to = trim($_POST['to'] ?? '');
    if ($to && filter_var($to, FILTER_VALIDATE_EMAIL)) {
        try {
            if ($_SERVER['REMOTE_ADDR'] === '127.0.0.1' || $_SERVER['REMOTE_ADDR'] === '::1') {
                $host = 'localhost'; $user = 'root'; $pass = ''; $db = 'presunavegatel'; $port = 3306;
            } else {
                $host = 'localhost'; $user = 'u600265163_HAggBlS0j_presupadmin'; $pass = 'Belchote1@'; $db = 'u600265163_HAggBlS0j_presup'; $port = 3306;
            }
            $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
            $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $row = $pdo->query("SELECT smtp_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
            if (!$row || empty(trim($row['smtp_host'] ?? '')) || empty(trim($row['smtp_user'] ?? ''))) {
                $result = ['ok' => false, 'msg' => 'SMTP no configurado. Ve a la app → Configuración → Empresa y rellena servidor (ej. smtp.gmail.com), usuario y contraseña de aplicación.'];
            } elseif (empty($row['smtp_enabled']) || $row['smtp_enabled'] == 0) {
                $result = ['ok' => false, 'msg' => 'SMTP está desactivado. En Configuración → Empresa activa «Usar SMTP para enviar correos» y guarda.'];
            } else {
                require_once __DIR__ . '/lib/PresupMailer.php';
                $smtpUser = trim($row['smtp_user']);
                $mailer = new PresupMailer([
                    'host' => trim($row['smtp_host']),
                    'port' => (int)($row['smtp_port'] ?? 587),
                    'user' => $smtpUser,
                    'pass' => $row['smtp_pass'] ?? '',
                    'secure' => strtolower(trim($row['smtp_secure'] ?? 'tls')),
                    'from_email' => strtolower($smtpUser),
                    'reply_to' => $smtpUser
                ]);
                $res = $mailer->send($to, 'PRESUP – Prueba de correo', 'Este es un correo de prueba. Si lo recibes, la configuración SMTP es correcta.', null, '');
                if (!empty($res['ok'])) {
                    $result = ['ok' => true, 'msg' => 'Correo de prueba enviado correctamente a ' . $to . '. Revisa la bandeja de entrada (y spam).'];
                } else {
                    $result = ['ok' => false, 'msg' => $res['error'] ?? 'No se pudo enviar.'];
                }
            }
        } catch (Throwable $e) {
            $result = ['ok' => false, 'msg' => 'Error: ' . $e->getMessage()];
        }
    } else {
        $result = ['ok' => false, 'msg' => 'Indica un email de destino válido.'];
    }
}

if (!$isLocal && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $result = ['ok' => false, 'msg' => 'La prueba de correo solo está permitida en localhost.'];
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprobar email – PRESUP</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 40px auto; padding: 20px; background: #f8fafc; }
        h1 { font-size: 1.25rem; color: #1e293b; margin-bottom: 8px; }
        p { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
        .box { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        label { display: block; font-weight: 500; color: #334155; margin-bottom: 6px; }
        input[type="email"] { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 1rem; box-sizing: border-box; }
        button { margin-top: 16px; padding: 10px 20px; background: #0f766e; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
        button:hover { background: #0d9488; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .result { margin-top: 20px; padding: 12px; border-radius: 6px; font-size: 0.95rem; }
        .result.success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
        .result.error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .warn { background: #fef3c7; color: #92400e; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 0.9rem; }
        a { color: #0f766e; }
    </style>
</head>
<body>
    <div class="box">
        <h1>Comprobar envío de email</h1>
        <p>Envía un correo de prueba para verificar que la configuración SMTP (Configuración → Empresa) es correcta.</p>

        <?php if (!$isLocal): ?>
            <div class="warn">Esta herramienta solo funciona en localhost. En el servidor de producción usa la app con sesión iniciada.</div>
        <?php endif; ?>

        <form method="post" action="">
            <label for="to">Enviar correo de prueba a:</label>
            <input type="email" id="to" name="to" placeholder="tu@email.com" value="<?php echo htmlspecialchars($_POST['to'] ?? ''); ?>" required>
            <button type="submit">Enviar correo de prueba</button>
        </form>

        <?php if ($result !== null): ?>
            <div class="result <?php echo $result['ok'] ? 'success' : 'error'; ?>">
                <?php echo htmlspecialchars($result['msg']); ?>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
