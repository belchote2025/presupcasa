<?php
/**
 * Script simple para crear iconos PWA desde logo.png
 * Usa ImageMagick o GD si está disponible
 */

if (!file_exists('logo.png')) {
    die("❌ Error: No se encuentra logo.png");
}

echo "<!DOCTYPE html>
<html lang='es'>
<head>
    <meta charset='UTF-8'>
    <title>Generar Iconos PWA</title>
    <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { background: #d4edda; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .error { background: #f8d7da; padding: 15px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>Generar Iconos PWA</h1>";

$sizes = [192, 512];
$created = 0;

// Intentar con ImageMagick primero
if (extension_loaded('imagick')) {
    try {
        $original = new Imagick('logo.png');
        foreach ($sizes as $size) {
            $icon = clone $original;
            $icon->resizeImage($size, $size, Imagick::FILTER_LANCZOS, 1, true);
            $icon->writeImage("icon-{$size}x{$size}.png");
            $created++;
            echo "<div class='success'>✅ Creado: icon-{$size}x{$size}.png</div>";
        }
    } catch (Exception $e) {
        echo "<div class='error'>Error con ImageMagick: " . $e->getMessage() . "</div>";
    }
}
// Si ImageMagick falla, intentar con GD
elseif (extension_loaded('gd')) {
    $source = imagecreatefrompng('logo.png');
    if ($source) {
        $w = imagesx($source);
        $h = imagesy($source);
        foreach ($sizes as $size) {
            $img = imagecreatetruecolor($size, $size);
            imagealphablending($img, false);
            imagesavealpha($img, true);
            $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
            imagefill($img, 0, 0, $transparent);
            imagealphablending($img, true);
            $ratio = min($size / $w, $size / $h);
            $nw = $w * $ratio;
            $nh = $h * $ratio;
            $x = ($size - $nw) / 2;
            $y = ($size - $nh) / 2;
            imagecopyresampled($img, $source, $x, $y, 0, 0, $nw, $nh, $w, $h);
            if (imagepng($img, "icon-{$size}x{$size}.png", 9)) {
                $created++;
                echo "<div class='success'>✅ Creado: icon-{$size}x{$size}.png</div>";
            }
            imagedestroy($img);
        }
        imagedestroy($source);
    }
} else {
    echo "<div class='error'>❌ No se encontró ImageMagick ni GD. Usa generate_icons.html en su lugar.</div>";
}

if ($created == count($sizes)) {
    echo "<div class='success'><h2>✅ ¡Iconos generados exitosamente!</h2>
    <p>Se crearon $created iconos. Puedes eliminar este archivo ahora.</p></div>";
} else {
    echo "<div class='error'><h2>⚠️ Algunos iconos no se pudieron generar</h2>
    <p>Se crearon $created de " . count($sizes) . " iconos.</p>
    <p><strong>Solución:</strong> Usa generate_icons.html en el navegador para generar los iconos manualmente.</p></div>";
}

echo "</body></html>";
?>

