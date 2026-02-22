<?php
// migrate_v3.php - Creación de tabla de Gastos
error_reporting(E_ALL);
ini_set('display_errors', 1);

if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $host = "localhost"; $user = "root"; $pass = ""; $db = "presunavegatel";
} else {
    $host = "localhost"; $user = "u600265163_HAggBlS0j_presupadmin"; $pass = "Belchote1@"; $db = "u600265163_HAggBlS0j_presup";
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Iniciando migración V3...<br>";

    // Crear tabla expenses
    $sqlExpenses = "CREATE TABLE IF NOT EXISTS expenses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        category VARCHAR(100),
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )";
    $pdo->exec($sqlExpenses);
    echo "Tabla 'expenses' verificada/creada.<br>";

    echo "<strong>Migración V3 completada con éxito.</strong>";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
