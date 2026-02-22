<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

echo "Probando conexión...<br>";

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "¡Conexión exitosa!<br>";
    
    $stmt = $pdo->query("SELECT COUNT(*) as total FROM users");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Usuarios en la tabla: " . $row['total'] . "<br>";
    
    $stmt = $pdo->query("SELECT username FROM users");
    while($u = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- Usuario: " . $u['username'] . "<br>";
    }

} catch (PDOException $e) {
    echo "Error de conexión: " . $e->getMessage();
}
?>
