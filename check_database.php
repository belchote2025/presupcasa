<?php
// check_database.php - Verificación y Actualización Completa de Base de Datos
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>🔍 Verificación Completa de Base de Datos</h2>";

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
    
    echo "<hr><h3>📋 Tablas Existentes:</h3>";
    
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $requiredTables = ['users', 'company_settings', 'customers', 'catalog', 'quotes', 'quote_items', 'appointments', 'invoices', 'invoice_items', 'expenses'];
    
    echo "<table border='1' cellpadding='10' style='border-collapse: collapse; margin: 20px 0; width: 100%;'>";
    echo "<tr style='background: #f0f0f0;'><th>Tabla Requerida</th><th>Estado</th><th>Registros</th></tr>";
    
    $missingTables = [];
    foreach ($requiredTables as $table) {
        $exists = in_array($table, $tables);
        $count = 0;
        
        if ($exists) {
            $stmt = $pdo->query("SELECT COUNT(*) FROM $table");
            $count = $stmt->fetchColumn();
            echo "<tr style='background: #d4edda;'>";
            echo "<td><strong>$table</strong></td>";
            echo "<td>✅ Existe</td>";
            echo "<td>$count registros</td>";
            echo "</tr>";
        } else {
            $missingTables[] = $table;
            echo "<tr style='background: #f8d7da;'>";
            echo "<td><strong>$table</strong></td>";
            echo "<td>❌ NO EXISTE</td>";
            echo "<td>-</td>";
            echo "</tr>";
        }
    }
    echo "</table>";
    
    echo "<hr><h3>🔧 Verificación de Columnas Críticas:</h3>";
    
    $fixes = [];
    
    // Verificar client_phone en quotes
    if (in_array('quotes', $tables)) {
        $columns = $pdo->query("SHOW COLUMNS FROM quotes")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('client_phone', $columns)) {
            $fixes[] = "ALTER TABLE quotes ADD COLUMN client_phone VARCHAR(20) AFTER client_email";
            echo "<p>⚠️ Falta columna <strong>client_phone</strong> en tabla <strong>quotes</strong></p>";
        } else {
            echo "<p>✅ Columna <strong>client_phone</strong> existe en <strong>quotes</strong></p>";
        }
    }
    
    // Verificar client_phone en invoices
    if (in_array('invoices', $tables)) {
        $columns = $pdo->query("SHOW COLUMNS FROM invoices")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('client_phone', $columns)) {
            $fixes[] = "ALTER TABLE invoices ADD COLUMN client_phone VARCHAR(20) AFTER client_email";
            echo "<p>⚠️ Falta columna <strong>client_phone</strong> en tabla <strong>invoices</strong></p>";
        } else {
            echo "<p>✅ Columna <strong>client_phone</strong> existe en <strong>invoices</strong></p>";
        }
    }
    
    // Verificar image_url en quote_items
    if (in_array('quote_items', $tables)) {
        $columns = $pdo->query("SHOW COLUMNS FROM quote_items")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('image_url', $columns)) {
            $fixes[] = "ALTER TABLE quote_items ADD COLUMN image_url VARCHAR(255) AFTER description";
            echo "<p>⚠️ Falta columna <strong>image_url</strong> en tabla <strong>quote_items</strong></p>";
        } else {
            echo "<p>✅ Columna <strong>image_url</strong> existe en <strong>quote_items</strong></p>";
        }
    }
    
    echo "<hr><h3>🔨 Correcciones Necesarias:</h3>";
    
    if (empty($missingTables) && empty($fixes)) {
        echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;'>";
        echo "<h2 style='color: #155724; margin: 0;'>✅ ¡BASE DE DATOS PERFECTA!</h2>";
        echo "<p>Todas las tablas y columnas están correctamente configuradas.</p>";
        echo "</div>";
    } else {
        echo "<div style='background: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #ffc107;'>";
        echo "<h3 style='color: #856404;'>⚠️ Se requieren actualizaciones</h3>";
        
        if (!empty($missingTables)) {
            echo "<p><strong>Tablas faltantes:</strong> " . implode(', ', $missingTables) . "</p>";
            echo "<p style='color: red;'>❌ Ejecuta los scripts de migración: migrate_v2.php y migrate_v3.php</p>";
        }
        
        if (!empty($fixes)) {
            echo "<p><strong>Aplicando correcciones automáticas...</strong></p>";
            foreach ($fixes as $sql) {
                try {
                    $pdo->exec($sql);
                    echo "<p style='color: green;'>✅ Ejecutado: <code>$sql</code></p>";
                } catch (Exception $e) {
                    echo "<p style='color: red;'>❌ Error: " . $e->getMessage() . "</p>";
                }
            }
            echo "<p style='color: green; font-weight: bold;'>✅ Correcciones aplicadas. Recarga esta página para verificar.</p>";
        }
        
        echo "</div>";
    }
    
    echo "<hr><h3>📊 Resumen de Datos:</h3>";
    echo "<table border='1' cellpadding='10' style='border-collapse: collapse; margin: 20px 0; width: 100%;'>";
    echo "<tr style='background: #f0f0f0;'><th>Métrica</th><th>Cantidad</th></tr>";
    
    if (in_array('users', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        echo "<tr><td>👥 Usuarios totales</td><td><strong>$count</strong></td></tr>";
    }
    
    if (in_array('quotes', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM quotes")->fetchColumn();
        echo "<tr><td>📄 Presupuestos totales</td><td><strong>$count</strong></td></tr>";
    }
    
    if (in_array('invoices', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM invoices")->fetchColumn();
        echo "<tr><td>🧾 Facturas totales</td><td><strong>$count</strong></td></tr>";
    }
    
    if (in_array('customers', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM customers")->fetchColumn();
        echo "<tr><td>👤 Clientes totales</td><td><strong>$count</strong></td></tr>";
    }
    
    if (in_array('expenses', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM expenses")->fetchColumn();
        echo "<tr><td>💰 Gastos registrados</td><td><strong>$count</strong></td></tr>";
    }
    
    if (in_array('appointments', $tables)) {
        $count = $pdo->query("SELECT COUNT(*) FROM appointments")->fetchColumn();
        echo "<tr><td>📅 Citas programadas</td><td><strong>$count</strong></td></tr>";
    }
    
    echo "</table>";
    
    echo "<hr>";
    echo "<p style='text-align: center; color: #666;'><em>Verificación completada el " . date('Y-m-d H:i:s') . "</em></p>";
    echo "<p style='text-align: center;'><strong>⚠️ SEGURIDAD:</strong> Elimina este archivo (check_database.php) después de usarlo.</p>";
    
} catch (Exception $e) {
    echo "<div style='background: #f8d7da; padding: 20px; border-radius: 8px; border: 2px solid #dc3545;'>";
    echo "<h2 style='color: #721c24;'>❌ Error de Conexión</h2>";
    echo "<p><strong>Mensaje:</strong> " . $e->getMessage() . "</p>";
    echo "</div>";
}
?>
