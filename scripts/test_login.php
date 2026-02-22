<?php
/**
 * Prueba de login: muestra la respuesta exacta del servidor.
 * Abre: http://localhost/presup/test_login.php
 * Solo funciona en local (127.0.0.1).
 */
header('Content-Type: text/html; charset=utf-8');
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1']);
if (!$isLocal) {
    die('Solo en local.');
}

$result = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['test_login'])) {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    
    $url = 'http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME']) . '/api.php';
    $postData = ['action' => 'login', 'username' => $username, 'password' => $password];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_COOKIE, session_name() . '=' . session_id()); // enviar cookie de esta sesión
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    $response = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    
    $headers = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    
    $result = '<h3>Respuesta del servidor (login)</h3>';
    $result .= '<p><strong>Headers:</strong></p><pre>' . htmlspecialchars($headers) . '</pre>';
    $result .= '<p><strong>Body (JSON):</strong></p><pre>' . htmlspecialchars($body) . '</pre>';
    
    $data = @json_decode($body, true);
    if ($data && isset($data['status']) && $data['status'] === 'success') {
        $result .= '<p style="color:green;"><strong>Login OK.</strong> Ahora abre la app en otra pestaña: <a href="index.html">index.html</a> y recarga. Deberías estar dentro.</p>';
    } else {
        $result .= '<p style="color:red;">Login falló o respuesta inesperada.</p>';
    }
}

// Comprobar sesión actual (get_boot_data)
session_start();
$sessionInfo = isset($_SESSION['user_id']) 
    ? 'Sesión activa: user_id=' . $_SESSION['user_id'] . ', username=' . ($_SESSION['username'] ?? '') 
    : 'No hay sesión activa.';
session_write_close();
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Test login</title>
    <style>
        body { font-family: sans-serif; max-width: 700px; margin: 20px auto; padding: 20px; }
        pre { background: #f0f0f0; padding: 10px; overflow-x: auto; font-size: 12px; }
        input, button { padding: 8px; margin: 4px 0; }
        button { background: #d21f2b; color: white; border: none; cursor: pointer; }
    </style>
</head>
<body>
    <h2>Prueba de login (local)</h2>
    <p><strong>Sesión actual:</strong> <?php echo htmlspecialchars($sessionInfo); ?></p>
    
    <form method="post">
        <input type="hidden" name="test_login" value="1">
        <p>Usuario: <input type="text" name="username" value="admin"></p>
        <p>Contraseña: <input type="password" name="password" value="admin123"></p>
        <button type="submit">Enviar login (POST a api.php)</button>
    </form>
    
    <?php echo $result; ?>
    
    <hr>
    <p><a href="check_login_local.php">Diagnóstico login</a> | <a href="index.html">Abrir la app</a></p>
</body>
</html>
