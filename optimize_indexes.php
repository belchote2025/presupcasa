<?php
// optimize_indexes.php
// Script sencillo para optimizar índices en producción sin cambiar datos.

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Detectar entorno igual que api.php
if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $host = "localhost"; $user = "root"; $pass = ""; $db = "presunavegatel";
    $port = 3306;
} else {
    $host = "localhost"; $user = "u600265163_HAggBlS0j_presupadmin"; $pass = "Belchote1@"; $db = "u600265163_HAggBlS0j_presup";
    $port = 3306;
}

try {
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $queries = [
        // quotes
        "ALTER TABLE quotes
            ADD INDEX IF NOT EXISTS idx_quotes_user_date (user_id, date)",
        "ALTER TABLE quotes
            ADD INDEX IF NOT EXISTS idx_quotes_date (date)",

        // quote_items
        "ALTER TABLE quote_items
            ADD INDEX IF NOT EXISTS idx_quote_items_quote (quote_id)",
        "ALTER TABLE quote_items
            ADD INDEX IF NOT EXISTS idx_quote_items_desc (description(100))",

        // invoices
        "ALTER TABLE invoices
            ADD INDEX IF NOT EXISTS idx_invoices_user_status (user_id, status)",
        "ALTER TABLE invoices
            ADD INDEX IF NOT EXISTS idx_invoices_date (date)"
    ];

    $results = [];

    foreach ($queries as $sql) {
        try {
            $pdo->exec($sql);
            $results[] = ["query" => $sql, "status" => "ok"];
        } catch (Exception $e) {
            // Algunos motores no soportan IF NOT EXISTS en índices;
            // en ese caso simplemente lo ignoramos si el índice ya existe.
            $results[] = ["query" => $sql, "status" => "error", "message" => $e->getMessage()];
        }
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        "status" => "done",
        "results" => $results
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}


