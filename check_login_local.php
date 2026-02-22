<?php
/**
 * Diagnóstico de login en local. Abre en el navegador: http://localhost/presup/check_login_local.php
 * Muestra si la BD conecta, si existen usuarios y si la sesión se guarda.
 */
header('Content-Type: text/html; charset=utf-8');
echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Diagnóstico login local</title>";
echo "<style>body{font-family:monospace;max-width:600px;margin:20px auto;padding:20px;} .ok{color:green;} .err{color:red;} pre{background:#f0f0f0;padding:10px;}</style></head><body><h2>Diagnóstico login (local)</h2>";

$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1']);
if (!$isLocal) {
    echo "<p class='err'>Esta página es solo para uso en local (127.0.0.1).</p></body></html>";
    exit;
}

$host = 'localhost'; $user = 'root'; $pass = ''; $db = 'presunavegatel'; $port = 3306;

echo "<p><strong>1. Conexión a la base de datos</strong></p>";
try {
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "<p class='ok'>OK – Conectado a $db</p>";
} catch (PDOException $e) {
    echo "<p class='err'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Comprueba que XAMPP MySQL esté encendido y que la base de datos '$db' exista.</p></body></html>";
    exit;
}

echo "<p><strong>2. Tabla users y usuarios</strong></p>";
try {
    $stmt = $pdo->query("SELECT id, username, role FROM users LIMIT 5");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($users)) {
        echo "<p class='err'>No hay usuarios en la tabla users. Ejecuta database.sql o inserta uno.</p>";
    } else {
        echo "<p class='ok'>Usuarios encontrados:</p><pre>" . htmlspecialchars(print_r($users, true)) . "</pre>";
    }
} catch (PDOException $e) {
    echo "<p class='err'>Error leyendo users: " . htmlspecialchars($e->getMessage()) . "</p></body></html>";
    exit;
}

echo "<p><strong>3. Sesión PHP</strong></p>";
session_start();
if (!isset($_SESSION['test'])) {
    $_SESSION['test'] = date('Y-m-d H:i:s');
    echo "<p class='ok'>Sesión iniciada. Valor guardado: " . $_SESSION['test'] . "</p>";
    echo "<p>Recarga esta página: si ves el mismo valor abajo, la sesión funciona.</p>";
} else {
    echo "<p class='ok'>Sesión OK – valor recuperado: " . htmlspecialchars($_SESSION['test']) . "</p>";
}

echo "<p><strong>4. Probar login en la app</strong></p>";
echo "<p>Abre <a href='http://localhost/presup/'>http://localhost/presup/</a> y entra con usuario <code>admin</code> y contraseña <code>admin123</code>.</p>";

// Restablecer contraseña de admin (solo local, para pruebas)
$resetDone = false;
if (isset($_POST['reset_admin']) && $_POST['reset_admin'] === '1') {
    try {
        $n = $pdo->exec("UPDATE users SET password = 'admin123' WHERE username = 'admin'");
        $resetDone = ($n !== false && $n > 0);
    } catch (PDOException $e) {
        echo "<p class='err'>Error al restablecer: " . htmlspecialchars($e->getMessage()) . "</p>";
    }
}
if ($resetDone) {
    echo "<p class='ok'><strong>Contraseña de admin restablecida a: admin123</strong>. Prueba a entrar de nuevo en la app.</p>";
}

echo "<p><strong>5. Si el login sigue fallando</strong></p>";
echo "<form method='post' style='margin:10px 0'>";
echo "<input type='hidden' name='reset_admin' value='1'>";
echo "<button type='submit'>Restablecer contraseña de admin a admin123</button>";
echo "</form>";
echo "<p><small>Úsalo solo en local si no recuerdas la contraseña. Luego borra este archivo en producción.</small></p>";

echo "<hr><p><strong>Siguiente paso:</strong> Recarga esta página (F5). Si en el punto 3 ves «Sesión OK – valor recuperado» con la misma hora, la sesión persiste. Luego abre la app, inicia sesión y, si falla, abre F12 → pestaña Red/Network, vuelve a intentar y revisa la petición a <code>api.php</code> y su respuesta.</p>";
echo "</body></html>";
