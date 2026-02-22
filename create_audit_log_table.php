<?php
// create_audit_log_table.php - Crear tabla de historial de cambios (audit log)
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Crear Tabla Audit Log</title>";
echo "<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#f5f5f5;}";
echo ".success{background:#d4edda;padding:20px;border-radius:8px;border:2px solid #28a745;margin:20px 0;}";
echo ".error{background:#f8d7da;padding:20px;border-radius:8px;border:2px solid #dc3545;margin:20px 0;}";
echo ".info{background:#d1ecf1;padding:20px;border-radius:8px;border:2px solid #17a2b8;margin:20px 0;}";
echo "table{border-collapse:collapse;width:100%;margin:20px 0;}";
echo "th,td{border:1px solid #ddd;padding:8px;text-align:left;}";
echo "th{background:#f0f0f0;}</style></head><body>";

echo "<h2>📋 Crear Tabla de Historial de Cambios (Audit Log)</h2>";

// Detectar entorno (local o producción)
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
    // Conexión con puerto explícito para evitar problemas de socket Unix
    $dsn = "mysql:host=$host;port=3306;dbname=$db;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true
    ]);
    
    echo "<div class='info'>";
    echo "<p>✅ Conexión a la base de datos establecida correctamente.</p>";
    echo "</div>";
    
    // Verificar si la tabla ya existe
    $stmt = $pdo->query("SHOW TABLES LIKE 'audit_log'");
    $tableExists = $stmt->rowCount() > 0;
    
    if ($tableExists) {
        echo "<div class='info'>";
        echo "<h3>ℹ️ La tabla 'audit_log' ya existe</h3>";
        echo "<p>La tabla de historial de cambios ya está creada. Mostrando estructura actual:</p>";
        
        // Mostrar estructura de la tabla
        $stmt = $pdo->query("DESCRIBE audit_log");
        $columns = $stmt->fetchAll();
        
        echo "<table>";
        echo "<tr><th>Campo</th><th>Tipo</th><th>Nulo</th><th>Clave</th><th>Por Defecto</th><th>Extra</th></tr>";
        foreach ($columns as $col) {
            echo "<tr>";
            echo "<td><strong>{$col['Field']}</strong></td>";
            echo "<td>{$col['Type']}</td>";
            echo "<td>{$col['Null']}</td>";
            echo "<td>{$col['Key']}</td>";
            echo "<td>{$col['Default']}</td>";
            echo "<td>{$col['Extra']}</td>";
            echo "</tr>";
        }
        echo "</table>";
        
        // Contar registros
        $stmt = $pdo->query("SELECT COUNT(*) as total FROM audit_log");
        $count = $stmt->fetch()['total'];
        echo "<p><strong>Total de registros en el historial:</strong> {$count}</p>";
        
        // Mostrar últimos 5 registros
        if ($count > 0) {
            echo "<h4>Últimos 5 registros:</h4>";
            $stmt = $pdo->query("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5");
            $recent = $stmt->fetchAll();
            
            echo "<table>";
            echo "<tr><th>ID</th><th>Tabla</th><th>Registro</th><th>Acción</th><th>Usuario</th><th>Fecha</th></tr>";
            foreach ($recent as $r) {
                echo "<tr>";
                echo "<td>{$r['id']}</td>";
                echo "<td>{$r['table_name']}</td>";
                echo "<td>{$r['record_id']}</td>";
                echo "<td>{$r['action']}</td>";
                echo "<td>{$r['username']}</td>";
                echo "<td>{$r['created_at']}</td>";
                echo "</tr>";
            }
            echo "</table>";
        }
        
        echo "</div>";
        
    } else {
        echo "<div class='info'>";
        echo "<p>⚙️ Creando tabla 'audit_log'...</p>";
        echo "</div>";
        
        // Crear la tabla
        $sql = "CREATE TABLE audit_log (
            id INT PRIMARY KEY AUTO_INCREMENT,
            table_name VARCHAR(50) NOT NULL,
            record_id VARCHAR(50) NOT NULL,
            action ENUM('create', 'update', 'delete') NOT NULL,
            user_id INT,
            username VARCHAR(50),
            changes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_table_record (table_name, record_id),
            INDEX idx_user_id (user_id),
            INDEX idx_created_at (created_at),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
        
        $pdo->exec($sql);
        
        echo "<div class='success'>";
        echo "<h2 style='color:#155724;margin:0;'>✅ ¡TABLA CREADA CON ÉXITO!</h2>";
        echo "<p>La tabla 'audit_log' ha sido creada correctamente con la siguiente estructura:</p>";
        
        echo "<table>";
        echo "<tr><th>Campo</th><th>Tipo</th><th>Descripción</th></tr>";
        echo "<tr><td><strong>id</strong></td><td>INT AUTO_INCREMENT</td><td>ID único del registro (auto-incremental)</td></tr>";
        echo "<tr><td><strong>table_name</strong></td><td>VARCHAR(50)</td><td>Nombre de la tabla modificada (quotes, invoices, etc.)</td></tr>";
        echo "<tr><td><strong>record_id</strong></td><td>VARCHAR(50)</td><td>ID del registro modificado</td></tr>";
        echo "<tr><td><strong>action</strong></td><td>ENUM</td><td>Tipo de acción: create, update, delete</td></tr>";
        echo "<tr><td><strong>user_id</strong></td><td>INT</td><td>ID del usuario que realizó la acción</td></tr>";
        echo "<tr><td><strong>username</strong></td><td>VARCHAR(50)</td><td>Nombre de usuario (para referencia rápida)</td></tr>";
        echo "<tr><td><strong>changes</strong></td><td>TEXT</td><td>JSON con los cambios realizados (solo en updates)</td></tr>";
        echo "<tr><td><strong>created_at</strong></td><td>DATETIME</td><td>Fecha y hora de la acción</td></tr>";
        echo "</table>";
        
        echo "<h3>✨ Funcionalidades habilitadas:</h3>";
        echo "<ul>";
        echo "<li>✅ Registro automático de creación de presupuestos/facturas</li>";
        echo "<li>✅ Registro automático de modificaciones con detalles de cambios</li>";
        echo "<li>✅ Visualización del historial en el editor de presupuestos/facturas</li>";
        echo "<li>✅ Índices optimizados para búsquedas rápidas</li>";
        echo "<li>✅ Relación con tabla users para integridad referencial</li>";
        echo "</ul>";
        
        echo "<h3>📊 Índices creados:</h3>";
        echo "<ul>";
        echo "<li><strong>idx_table_record:</strong> Búsqueda rápida por tabla y registro</li>";
        echo "<li><strong>idx_user_id:</strong> Búsqueda rápida por usuario</li>";
        echo "<li><strong>idx_created_at:</strong> Ordenación rápida por fecha</li>";
        echo "</ul>";
        
        echo "<p style='margin-top:20px;'><strong>🎉 El historial de cambios ya está activo. Todas las modificaciones futuras se registrarán automáticamente.</strong></p>";
        echo "</div>";
    }
    
} catch (PDOException $e) {
    echo "<div class='error'>";
    echo "<h3 style='color:#721c24;margin:0;'>❌ Error al crear la tabla</h3>";
    echo "<p><strong>Error:</strong> " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p><strong>Código:</strong> " . $e->getCode() . "</p>";
    echo "</div>";
} catch (Exception $e) {
    echo "<div class='error'>";
    echo "<h3 style='color:#721c24;margin:0;'>❌ Error inesperado</h3>";
    echo "<p><strong>Error:</strong> " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "</div>";
}

echo "<hr>";
echo "<p><small>Script ejecutado el " . date('Y-m-d H:i:s') . "</small></p>";
echo "</body></html>";

