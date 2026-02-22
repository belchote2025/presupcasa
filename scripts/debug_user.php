<?php
// Configuración de visualización de errores máxima para detectar el problema
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Datos de conexión finales
$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

echo "<h1>Debug de Creación de Usuarios</h1>";

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "1. Conexión establecida.<br>";
    
    // Datos del usuario de prueba
    $test_user = "prueba_" . rand(100, 999);
    $test_pass = "123456";
    $test_role = "user";
    
    echo "2. Intentando insertar usuario: <b>$test_user</b>...<br>";
    
    $stmt = $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
    $stmt->execute([$test_user, $test_pass, $test_role]);
    
    echo "3. ¡ÉXITO! Usuario insertado con ID: " . $pdo->lastInsertId() . "<br>";
    
    echo "4. Listado actual de usuarios:<br>";
    $stmt = $pdo->query("SELECT id, username, role FROM users");
    while($u = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- ID: {$u['id']} | User: {$u['username']} | Role: {$u['role']}<br>";
    }

} catch (PDOException $e) {
    echo "<br><b style='color:red'>ERROR DE SQL:</b> " . $e->getMessage();
} catch (Exception $e) {
    echo "<br><b style='color:red'>ERROR GENERAL:</b> " . $e->getMessage();
}
?>
