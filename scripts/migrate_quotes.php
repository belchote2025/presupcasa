<?php
// Configuración de conexión
$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $user = "root"; $pass = ""; $db = "presunavegatel";
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "<h3>Sincronizando Base de Datos...</h3>";

    // 1. Añadir image_url a quote_items para que persistan en los presupuestos guardados
    try {
        $pdo->query("SELECT image_url FROM quote_items LIMIT 1");
        echo "• La columna 'image_url' ya existe en 'quote_items'.<br>";
    } catch (Exception $e) {
        $pdo->query("ALTER TABLE quote_items ADD COLUMN image_url VARCHAR(255) AFTER description");
        echo "• ¡ÉXITO! Añadida columna 'image_url' a la tabla 'quote_items'.<br>";
    }

    echo "<br><b>Sincronización completada.</b>";

} catch (PDOException $e) {
    echo "<h4 style='color:red'>Error:</h4> " . $e->getMessage();
}
?>
