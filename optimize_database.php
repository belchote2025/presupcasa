<?php
// optimize_database.php
// Script para crear índices que mejoran el rendimiento de las consultas
// Ejecutar UNA VEZ en producción para optimizar la base de datos

error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: text/plain; charset=utf-8');

// --- CONFIG DB (igual que api.php) ---
if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $host = "localhost"; $user = "root"; $pass = ""; $db = "presunavegatel";
} else {
    $host = "localhost"; $user = "u600265163_HAggBlS0j_presupadmin"; $pass = "Belchote1@"; $db = "u600265163_HAggBlS0j_presup";
}

try {
    // Construir DSN con puerto explícito para evitar problemas con sockets Unix
    $dsn = "mysql:host=$host;port=3306;dbname=$db;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
        PDO::ATTR_PERSISTENT => false
    ]);
    
    echo "=== OPTIMIZACIÓN DE BASE DE DATOS ===\n\n";
    
    // 1. Índices para quotes
    echo "1. Creando índices en tabla quotes...\n";
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id)");
        echo "   ✓ Índice idx_quotes_user_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_quotes_user_id: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(date)");
        echo "   ✓ Índice idx_quotes_date creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_quotes_date: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)");
        echo "   ✓ Índice idx_quotes_status creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_quotes_status: " . $e->getMessage() . "\n";
    }
    
    // 2. Índices para quote_items
    echo "\n2. Creando índices en tabla quote_items...\n";
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id)");
        echo "   ✓ Índice idx_quote_items_quote_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_quote_items_quote_id: " . $e->getMessage() . "\n";
    }
    
    // 3. Índices para invoices
    echo "\n3. Creando índices en tabla invoices...\n";
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id)");
        echo "   ✓ Índice idx_invoices_user_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_invoices_user_id: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)");
        echo "   ✓ Índice idx_invoices_date creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_invoices_date: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)");
        echo "   ✓ Índice idx_invoices_status creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_invoices_status: " . $e->getMessage() . "\n";
    }
    
    // 4. Índices para invoice_items
    echo "\n4. Creando índices en tabla invoice_items...\n";
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id)");
        echo "   ✓ Índice idx_invoice_items_invoice_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_invoice_items_invoice_id: " . $e->getMessage() . "\n";
    }
    
    // 5. Índices para otras tablas
    echo "\n5. Creando índices en otras tablas...\n";
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id)");
        echo "   ✓ Índice idx_customers_user_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_customers_user_id: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id)");
        echo "   ✓ Índice idx_expenses_user_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_expenses_user_id: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)");
        echo "   ✓ Índice idx_expenses_date creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_expenses_date: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id)");
        echo "   ✓ Índice idx_appointments_user_id creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_appointments_user_id: " . $e->getMessage() . "\n";
    }
    
    try {
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)");
        echo "   ✓ Índice idx_appointments_date creado\n";
    } catch (Exception $e) {
        echo "   ⚠ idx_appointments_date: " . $e->getMessage() . "\n";
    }
    
    // 6. Optimizar tablas
    echo "\n6. Optimizando tablas...\n";
    $tables = ['quotes', 'quote_items', 'invoices', 'invoice_items', 'customers', 'expenses', 'appointments'];
    foreach ($tables as $table) {
        try {
            // Cerrar cualquier consulta pendiente antes de OPTIMIZE
            $pdo->exec("SET @dummy = 0");
            $stmt = $pdo->prepare("OPTIMIZE TABLE `$table`");
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $stmt->closeCursor();
            echo "   ✓ Tabla $table optimizada\n";
        } catch (Exception $e) {
            echo "   ⚠ $table: " . $e->getMessage() . "\n";
        }
    }
    
    echo "\n=== OPTIMIZACIÓN COMPLETADA ===\n";
    echo "Los índices mejorarán significativamente el rendimiento de las consultas.\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}

