<?php
// Configuración de conexión (usando tus datos de Hostinger)
$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

// Si detectamos que estamos en local, usamos los datos de XAMPP
if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $user = "root";
    $pass = "";
    $db   = "presunavegatel";
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "<h3>Iniciando migración del Catálogo...</h3>";

    // Columnas a añadir
    $cols = [
        'long_description' => "TEXT AFTER description",
        'image_url' => "VARCHAR(255) AFTER long_description"
    ];

    foreach ($cols as $col => $def) {
        try {
            // Intentamos seleccionar la columna para ver si ya existe
            $pdo->query("SELECT $col FROM catalog LIMIT 1");
            echo "• La columna '<b>$col</b>' ya existe en la tabla 'catalog'.<br>";
        } catch (Exception $e) {
            // Si da error, es que no existe, así que la creamos
            $pdo->query("ALTER TABLE catalog ADD COLUMN $col $def");
            echo "• ¡ÉXITO! Añadida columna '<b>$col</b>' a la tabla 'catalog'.<br>";
        }
    }

    echo "<br><b>Sincronización completada con éxito. Ya puedes usar el catálogo con fotos.</b>";
    echo "<br><br><small>Por seguridad, borra este archivo del servidor después de usarlo.</small>";

} catch (PDOException $e) {
    echo "<h4 style='color:red'>Error de Base de Datos:</h4> " . $e->getMessage();
}
?>
