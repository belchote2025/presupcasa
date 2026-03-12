# Recomendaciones de Seguridad - Proyecto Presup

## ✅ Errores Críticos Solucionados

1. **error_reporting(0)** → `error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT)`
2. **Console.log en producción** → Envueltos en condición localhost
3. **Excepción genérica** → Mensaje descriptivo con solución
4. **Falta strict_types** → Añadido `declare(strict_types=1)`

## ⚠️ Acciones Manuales Requeridas

### 1. Configurar Variables de Entorno

**Paso 1:** Copiar archivo de ejemplo
```bash
cp .env.example .env
```

**Paso 2:** Editar `.env` con tus credenciales reales
```env
DB_HOST=localhost
DB_USER=tu_usuario_real
DB_PASS=tu_contraseña_real
DB_NAME=tu_base_de_datos
```

### 2. Actualizar Scripts Cron

Archivos que necesitan actualización:
- `cron_backup.php`
- `cron_process_recurring.php`

Reemplazar credenciales hardcodeadas con:
```php
require_once __DIR__ . '/config.php';
$dbConfig = getDatabaseConfig();
```

### 3. Archivos de Debug (Eliminar en Producción)

Estos archivos contienen credenciales y deben eliminarse:
- `debug_user.php`
- `debug_quote.php`
- `test_login.php`
- `fix_admin.php`

### 4. Validación de Archivos

Añadir validación para `file_get_contents()`:
```php
function safeFileGetContents(string $filename): string|false {
    $allowedPaths = [
        __DIR__ . '/logs/',
        __DIR__ . '/uploads/',
        __DIR__ . '/api.php'
    ];
    
    $realPath = realpath($filename);
    foreach ($allowedPaths as $path) {
        if (strpos($realPath, realpath($path)) === 0) {
            return file_get_contents($filename);
        }
    }
    
    return false;
}
```

## 🔒 Mejoras de Seguridad Adicionales

### 1. Implementar Rate Limiting
```php
session_start();
if (!isset($_SESSION['requests'])) {
    $_SESSION['requests'] = 0;
    $_SESSION['requests_time'] = time();
}

if (time() - $_SESSION['requests_time'] > 60) {
    $_SESSION['requests'] = 0;
    $_SESSION['requests_time'] = time();
}

if ($_SESSION['requests'] > 100) {
    http_response_code(429);
    exit('Too Many Requests');
}

$_SESSION['requests']++;
```

### 2. Validación de Entrada Mejorada
```php
function validateInput(string $input, string $type = 'string'): string|int|float {
    return match($type) {
        'email' => filter_var($input, FILTER_VALIDATE_EMAIL),
        'int' => filter_var($input, FILTER_VALIDATE_INT),
        'float' => filter_var($input, FILTER_VALIDATE_FLOAT),
        'string' => htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8'),
        default => throw new InvalidArgumentException('Invalid validation type')
    };
}
```

### 3. Headers de Seguridad
```php
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");
header("Content-Security-Policy: default-src 'self'");
```

## 📋 Checklist de Producción

- [ ] Configurar `.env` con credenciales reales
- [ ] Eliminar archivos de debug
- [ ] Implementar rate limiting
- [ ] Añadir headers de seguridad
- [ ] Configurar backup automático
- [ ] Actualizar scripts cron
- [ ] Revisar permisos de archivos (755 para directorios, 644 para archivos)
- [ ] Configurar HTTPS
- [ ] Implementar monitoreo de errores

## 🚀 Próximos Pasos

1. **Testing**: Probar todas las funcionalidades después de los cambios
2. **Monitoring**: Implementar sistema de logs centralizado
3. **Performance**: Considerar caché para consultas frecuentes
4. **Backup**: Configurar backup automático de base de datos
5. **Updates**: Mantener dependencias actualizadas
