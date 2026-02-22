<?php
// fix_admin.php - Script para asegurar que el usuario admin tenga permisos correctos
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h2>🔧 Script de Verificación y Corrección de Administrador</h2>";

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
    echo "<h3>📊 Estado Actual de Usuarios:</h3>";
    
    // Mostrar todos los usuarios
    $stmt = $pdo->query("SELECT id, username, role FROM users ORDER BY id");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<table border='1' cellpadding='10' style='border-collapse: collapse; margin: 20px 0;'>";
    echo "<tr style='background: #f0f0f0;'><th>ID</th><th>Usuario</th><th>Rol Actual</th><th>Estado</th></tr>";
    
    $adminExists = false;
    $adminCorrect = false;
    
    foreach ($users as $u) {
        $status = "";
        $color = "#fff";
        
        if ($u['username'] === 'admin') {
            $adminExists = true;
            if ($u['role'] === 'admin') {
                $status = "✅ CORRECTO";
                $color = "#d4edda";
                $adminCorrect = true;
            } else {
                $status = "⚠️ NECESITA CORRECCIÓN";
                $color = "#fff3cd";
            }
        } else {
            $status = $u['role'] === 'user' ? "👤 Usuario normal" : "⚠️ Rol inusual";
        }
        
        echo "<tr style='background: $color;'>";
        echo "<td>{$u['id']}</td>";
        echo "<td><strong>{$u['username']}</strong></td>";
        echo "<td>{$u['role']}</td>";
        echo "<td>$status</td>";
        echo "</tr>";
    }
    echo "</table>";
    
    echo "<hr>";
    echo "<h3>🔨 Acciones Realizadas:</h3>";
    
    // Corregir si es necesario
    if (!$adminExists) {
        echo "<p style='color: red;'>❌ <strong>ERROR:</strong> No existe el usuario 'admin'. Creándolo...</p>";
        $stmt = $pdo->prepare("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");
        $stmt->execute();
        echo "<p style='color: green;'>✅ Usuario 'admin' creado con contraseña 'admin123'</p>";
    } elseif (!$adminCorrect) {
        echo "<p style='color: orange;'>⚠️ El usuario 'admin' existe pero no tiene rol de administrador. Corrigiendo...</p>";
        $stmt = $pdo->prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'");
        $stmt->execute();
        echo "<p style='color: green;'>✅ Rol de 'admin' actualizado correctamente a 'admin'</p>";
    } else {
        echo "<p style='color: green;'>✅ El usuario 'admin' ya tiene permisos correctos. No se requieren cambios.</p>";
    }
    
    echo "<hr>";
    echo "<h3>📋 Verificación Final:</h3>";
    
    // Verificar de nuevo
    $stmt = $pdo->prepare("SELECT username, role FROM users WHERE username = 'admin'");
    $stmt->execute();
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($admin && $admin['role'] === 'admin') {
        echo "<div style='background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;'>";
        echo "<h2 style='color: #155724; margin: 0;'>✅ ¡ÉXITO TOTAL!</h2>";
        echo "<p style='margin: 10px 0 0 0;'>El usuario '<strong>admin</strong>' tiene permisos de administrador correctamente configurados.</p>";
        echo "<p style='margin: 10px 0 0 0;'><strong>Ahora puedes:</strong></p>";
        echo "<ul>";
        echo "<li>Ver todos los presupuestos de todos los usuarios</li>";
        echo "<li>Ver todas las facturas de todos los usuarios</li>";
        echo "<li>Gestionar clientes, citas y gastos de todo el equipo</li>";
        echo "<li>Editar y eliminar cualquier registro</li>";
        echo "</ul>";
        echo "</div>";
    } else {
        echo "<div style='background: #f8d7da; padding: 20px; border-radius: 8px; border: 2px solid #dc3545;'>";
        echo "<h2 style='color: #721c24; margin: 0;'>❌ ERROR</h2>";
        echo "<p>No se pudo verificar el usuario admin. Por favor, contacta con soporte técnico.</p>";
        echo "</div>";
    }
    
    echo "<hr>";
    echo "<p style='text-align: center; color: #666;'><em>Puedes cerrar esta ventana y recargar tu aplicación.</em></p>";
    echo "<p style='text-align: center;'><strong>⚠️ IMPORTANTE:</strong> Por seguridad, elimina este archivo (fix_admin.php) después de usarlo.</p>";
    
} catch (Exception $e) {
    echo "<div style='background: #f8d7da; padding: 20px; border-radius: 8px; border: 2px solid #dc3545;'>";
    echo "<h2 style='color: #721c24;'>❌ Error de Conexión</h2>";
    echo "<p><strong>Mensaje:</strong> " . $e->getMessage() . "</p>";
    echo "</div>";
}
?>
