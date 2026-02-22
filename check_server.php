<?php
// Script de prueba para detectar errores 500
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>Probando Servidor Hostinger</h1>";

// 1. Probar PHP básico
echo "✓ PHP funciona correctamente.<br>";

// 2. Probar Sesiones
session_start();
$_SESSION['test'] = "ok";
echo "✓ Sesión iniciada correctamente.<br>";

// 3. Probar PDO y DB
$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✓ Conexión a Base de Datos: OK.<br>";
    
    $stmt = $pdo->query("SELECT version()");
    echo "✓ Versión MySQL: " . $stmt->fetchColumn() . "<br>";
} catch (PDOException $e) {
    echo "<b style='color:red'>✗ Error Base de Datos:</b> " . $e->getMessage() . "<br>";
}

// 4. Probar JSON
$json = json_encode(["test" => "ok"]);
if ($json) {
    echo "✓ Función json_encode: OK.<br>";
} else {
    echo "<b>✗ Error json_encode</b><br>";
}

echo "<h3>Si has visto todos los '✓' arriba, el servidor está bien y el problema está en api.php.</h3>";
?>
