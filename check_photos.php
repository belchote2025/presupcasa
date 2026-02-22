<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>Diagnóstico de Fotos</h1>";

// 1. Comprobar carpeta uploads
if (!is_dir('uploads')) {
    echo "✗ La carpeta 'uploads' NO existe. Intentando crearla...<br>";
    if (mkdir('uploads', 0777, true)) {
        echo "✓ Carpeta 'uploads' creada con éxito.<br>";
    } else {
        echo "✗ ERROR: No se ha podido crear la carpeta 'uploads'. Revisa permisos en Hostinger.<br>";
    }
} else {
    echo "✓ La carpeta 'uploads' existe.<br>";
    if (is_writable('uploads')) {
        echo "✓ La carpeta 'uploads' tiene permisos de escritura.<br>";
    } else {
        echo "✗ ERROR: La carpeta 'uploads' NO tiene permisos de escritura.<br>";
    }
}

// 2. Comprobar archivos en uploads
$files = glob('uploads/*');
echo "<h3>Archivos encontrados en uploads (" . count($files) . "):</h3>";
foreach ($files as $file) {
    echo "- $file (" . filesize($file) . " octetos)<br>";
}

// 3. Comprobar base de datos
$host = "localhost";
$user = "u600265163_HAggBlS0j_presupadmin"; 
$pass = "Belchote1@"; 
$db   = "u600265163_HAggBlS0j_presup";

if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $user = "root"; $pass = ""; $db = "presunavegatel";
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $stmt = $pdo->query("SELECT id, description, image_url FROM catalog WHERE image_url IS NOT NULL");
    echo "<h3>Fotos registradas en BD:</h3>";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "- Item ID: {$row['id']} | Desc: {$row['description']} | URL: <b>{$row['image_url']}</b><br>";
        if (file_exists($row['image_url'])) {
            echo "  <span style='color:green'>[ARCHIVO EXISTE]</span><br>";
        } else {
            echo "  <span style='color:red'>[ARCHIVO NO ENCONTRADO EN SERVIDOR]</span><br>";
        }
    }
} catch (Exception $e) {
    echo "Error BD: " . $e->getMessage();
}
?>
