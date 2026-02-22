<?php
// migrate_v2.php - Actualización de Base de Datos para Facturas y WhatsApp
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

    echo "Iniciando migración...<br>";

    // 1. Añadir client_phone a quotes
    try {
        $pdo->exec("ALTER TABLE quotes ADD COLUMN client_phone VARCHAR(20) AFTER client_email");
        echo "Columna client_phone añadida a 'quotes'.<br>";
    } catch(Exception $e) { echo "Columna client_phone ya existía en 'quotes' o error: " . $e->getMessage() . "<br>"; }

    // 2. Crear tabla invoices
    $sqlInvoices = "CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(50) PRIMARY KEY,
        quote_id VARCHAR(50),
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        client_name VARCHAR(255),
        client_id VARCHAR(50),
        client_address TEXT,
        client_email VARCHAR(255),
        client_phone VARCHAR(20),
        notes TEXT,
        status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
        subtotal DECIMAL(10,2),
        tax_amount DECIMAL(10,2),
        total_amount DECIMAL(10,2),
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL
    )";
    $pdo->exec($sqlInvoices);
    echo "Tabla 'invoices' verificada/creada.<br>";

    // 3. Crear tabla invoice_items
    $sqlItems = "CREATE TABLE IF NOT EXISTS invoice_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        invoice_id VARCHAR(50),
        description TEXT,
        image_url VARCHAR(255),
        quantity DECIMAL(10,2),
        price DECIMAL(10,2),
        tax_percent DECIMAL(5,2),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )";
    $pdo->exec($sqlItems);
    echo "Tabla 'invoice_items' verificada/creada.<br>";

    echo "<strong>Migración completada con éxito.</strong>";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
