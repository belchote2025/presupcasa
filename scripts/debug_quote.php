<?php
// debug_quote.php
// Pequeño script de diagnóstico para comprobar si un presupuesto existe
// y qué datos tiene realmente en la base de datos.
//
// USO (en producción o local):
//   https://TU_DOMINIO/debug_quote.php?id=PRE-XXXXXXXXXXXX
//
// IMPORTANTE:
// - No requiere login ni sesión (es solo diagnóstico, bórralo cuando acabes).
// - No modifica nada, solo hace SELECT.

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
        PDO::ATTR_PERSISTENT => false
    ]);
} catch (Exception $e) {
    echo "ERROR CONECTANDO A BD:\n" . $e->getMessage();
    exit;
}

$id = isset($_GET['id']) ? trim($_GET['id']) : '';

if ($id === '') {
    echo "FALTA PARÁMETRO id\n";
    echo "Ejemplo: debug_quote.php?id=PRE-1769164562635\n";
    exit;
}

echo "=== DEBUG PRESUPUESTO ===\n";
echo "ID recibido: {$id}\n\n";

try {
    // 1) Buscar en quotes
    $stmt = $pdo->prepare("SELECT * FROM quotes WHERE id = ?");
    $stmt->execute([$id]);
    $quote = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$quote) {
        echo "NO SE HA ENCONTRADO EL PRESUPUESTO EN quotes.\n";
        exit;
    }

    echo "PRESUPUESTO ENCONTRADO EN quotes:\n";
    print_r($quote);
    echo "\n";

    // 2) Buscar items asociados
    $stmt = $pdo->prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id ASC");
    $stmt->execute([$id]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "NÚMERO DE ITEMS EN quote_items: " . count($items) . "\n";
    if (!empty($items)) {
        echo "PRIMEROS ITEMS:\n";
        foreach ($items as $idx => $it) {
            echo "---- ITEM #" . ($idx + 1) . " ----\n";
            print_r($it);
            if ($idx >= 4) { // mostrar máximo 5
                echo "...\n";
                break;
            }
        }
    } else {
        echo "NO HAY ITEMS ASOCIADOS EN quote_items.\n";
    }

    // 3) Comprobar índices rápidos / tamaño de tablas (muy básico)
    echo "\n=== INFO RÁPIDA TABLA quotes ===\n";
    $stmt = $pdo->query("SELECT COUNT(*) AS total FROM quotes");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "TOTAL REGISTROS EN quotes: " . ($row['total'] ?? 'desconocido') . "\n";

    echo "\n=== INFO RÁPIDA TABLA quote_items ===\n";
    $stmt = $pdo->query("SELECT COUNT(*) AS total FROM quote_items");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "TOTAL REGISTROS EN quote_items: " . ($row['total'] ?? 'desconocido') . "\n";

} catch (Exception $e) {
    echo "ERROR EJECUTANDO CONSULTAS:\n" . $e->getMessage();
}


