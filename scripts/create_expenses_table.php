<?php
// create_expenses_table.php - Crear tabla de gastos automáticamente
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>💰 Creación de Tabla de Gastos</h2>";

if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $host = "localhost"; 
    $user = "root"; 
    $pass = ""; 
    $db = "presunavegatel";
    echo "<p>📍 Entorno: <strong>LOCAL</strong></p>";
} else {
    $host = "localhost"; 
    $user = "u600265163_HAggBlS0j_presupadmin"; 
    $pass = "Belchote1@"; 
    $db = "u600265163_HAggBlS0j_presup";
    echo "<p>📍 Entorno: <strong>PRODUCCIÓN (Hostinger)</strong></p>";
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "<hr>";
    
    // Verificar si la tabla ya existe
    $tables = $pdo->query("SHOW TABLES LIKE 'expenses'")->fetchAll();
    
    if (count($tables) > 0) {
        echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;'>";
        echo "<h2 style='color: #155724; margin: 0;'>✅ Tabla ya existe</h2>";
        echo "<p>La tabla 'expenses' ya está creada en la base de datos.</p>";
        
        // Mostrar estructura
        $columns = $pdo->query("SHOW COLUMNS FROM expenses")->fetchAll(PDO::FETCH_ASSOC);
        echo "<h3>Estructura actual:</h3>";
        echo "<table border='1' cellpadding='8' style='border-collapse: collapse;'>";
        echo "<tr style='background: #f0f0f0;'><th>Campo</th><th>Tipo</th><th>Null</th><th>Default</th></tr>";
        foreach ($columns as $col) {
            echo "<tr>";
            echo "<td><strong>{$col['Field']}</strong></td>";
            echo "<td>{$col['Type']}</td>";
            echo "<td>{$col['Null']}</td>";
            echo "<td>" . ($col['Default'] ?? 'NULL') . "</td>";
            echo "</tr>";
        }
        echo "</table>";
        
        $count = $pdo->query("SELECT COUNT(*) FROM expenses")->fetchColumn();
        echo "<p>📊 Registros actuales: <strong>$count</strong></p>";
        echo "</div>";
        
    } else {
        echo "<p>⚙️ Creando tabla 'expenses'...</p>";
        
        $sql = "CREATE TABLE expenses (
            id INT PRIMARY KEY AUTO_INCREMENT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            description VARCHAR(255) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            category VARCHAR(100),
            user_id INT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
        
        $pdo->exec($sql);
        
        echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745; margin-top: 20px;'>";
        echo "<h2 style='color: #155724; margin: 0;'>✅ ¡TABLA CREADA CON ÉXITO!</h2>";
        echo "<p>La tabla 'expenses' ha sido creada correctamente con la siguiente estructura:</p>";
        
        echo "<table border='1' cellpadding='8' style='border-collapse: collapse; margin: 20px 0;'>";
        echo "<tr style='background: #f0f0f0;'><th>Campo</th><th>Tipo</th><th>Descripción</th></tr>";
        echo "<tr><td><strong>id</strong></td><td>INT</td><td>ID único del gasto (auto-incremental)</td></tr>";
        echo "<tr><td><strong>date</strong></td><td>DATETIME</td><td>Fecha del gasto</td></tr>";
        echo "<tr><td><strong>description</strong></td><td>VARCHAR(255)</td><td>Descripción del gasto</td></tr>";
        echo "<tr><td><strong>amount</strong></td><td>DECIMAL(10,2)</td><td>Importe del gasto</td></tr>";
        echo "<tr><td><strong>category</strong></td><td>VARCHAR(100)</td><td>Categoría (Suministros, Personal, etc.)</td></tr>";
        echo "<tr><td><strong>user_id</strong></td><td>INT</td><td>Usuario que registró el gasto</td></tr>";
        echo "</table>";
        
        echo "<h3>✨ Funcionalidades habilitadas:</h3>";
        echo "<ul>";
        echo "<li>✅ Registro de gastos por usuario</li>";
        echo "<li>✅ Categorización de gastos</li>";
        echo "<li>✅ Cálculo automático de balance en el Dashboard</li>";
        echo "<li>✅ Visión global para administradores</li>";
        echo "</ul>";
        
        echo "</div>";
    }
    
    echo "<hr>";
    echo "<h3>🔍 Verificación Final:</h3>";
    
    // Verificar que todo esté correcto
    $allTables = ['users', 'company_settings', 'customers', 'catalog', 'quotes', 'quote_items', 'appointments', 'invoices', 'invoice_items', 'expenses'];
    $existing = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    
    $allOk = true;
    echo "<table border='1' cellpadding='8' style='border-collapse: collapse; width: 100%;'>";
    echo "<tr style='background: #f0f0f0;'><th>Tabla</th><th>Estado</th></tr>";
    
    foreach ($allTables as $table) {
        $exists = in_array($table, $existing);
        if ($exists) {
            echo "<tr style='background: #d4edda;'><td>$table</td><td>✅ OK</td></tr>";
        } else {
            echo "<tr style='background: #f8d7da;'><td>$table</td><td>❌ FALTA</td></tr>";
            $allOk = false;
        }
    }
    echo "</table>";
    
    if ($allOk) {
        echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745; margin-top: 20px;'>";
        echo "<h2 style='color: #155724; margin: 0;'>🎉 ¡BASE DE DATOS 100% COMPLETA!</h2>";
        echo "<p>Todas las tablas necesarias están creadas y funcionando correctamente.</p>";
        echo "<p><strong>Ya puedes usar todas las funcionalidades:</strong></p>";
        echo "<ul>";
        echo "<li>✅ Dashboard con estadísticas completas</li>";
        echo "<li>✅ Gestión de gastos</li>";
        echo "<li>✅ Cálculo de balance neto (Ingresos - Gastos)</li>";
        echo "<li>✅ Modo administrador global</li>";
        echo "</ul>";
        echo "</div>";
    }
    
    echo "<hr>";
    echo "<p style='text-align: center; color: #666;'><em>Puedes cerrar esta ventana y recargar tu aplicación.</em></p>";
    echo "<p style='text-align: center;'><strong>⚠️ SEGURIDAD:</strong> Elimina este archivo (create_expenses_table.php) después de usarlo.</p>";
    
} catch (Exception $e) {
    echo "<div style='background: #f8d7da; padding: 20px; border-radius: 8px; border: 2px solid #dc3545;'>";
    echo "<h2 style='color: #721c24;'>❌ Error</h2>";
    echo "<p><strong>Mensaje:</strong> " . $e->getMessage() . "</p>";
    echo "</div>";
}
?>
