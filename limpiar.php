<?php
// limpiar.php - Ejecuta esto en Hostinger para resetearlo todo
session_start();
session_destroy();

// Borrar el Service Worker antiguo si existe
if (file_exists('sw.js')) {
    unlink('sw.js');
}

echo "<h3>✅ Servidor Limpiado</h3>";
echo "<p>1. Se han cerrado todas las sesiones.</p>";
echo "<p>2. Se ha eliminado el Service Worker antiguo.</p>";
echo "<p>3. Ahora sube el nuevo <b>app.js</b> y actualiza el <b>index.html</b>.</p>";
?>
