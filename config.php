<?php
declare(strict_types=1);

/**
 * Archivo de configuración centralizado
 * Carga variables de entorno desde .env
 */

function loadEnv(string $path): void {
    if (!file_exists($path)) {
        return;
    }
    
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        
        if (strpos($line, '=') === false) {
            continue;
        }
        
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        
        // Remove quotes if present
        if (strpos($value, '"') === 0 || strpos($value, "'") === 0) {
            $value = substr($value, 1, -1);
        }
        
        putenv("$name=$value");
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }
}

// Load environment variables
loadEnv(__DIR__ . '/.env');

// Database configuration
function getDatabaseConfig(): array {
    if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
        // Local development
        return [
            'host' => getenv('DB_HOST') ?: 'localhost',
            'user' => getenv('DB_USER') ?: 'root',
            'pass' => getenv('DB_PASS') ?: '',
            'db'   => getenv('DB_NAME') ?: 'presunavegatel',
            'port' => (int)(getenv('DB_PORT') ?: 3306)
        ];
    } else {
        // Production - use environment variables
        return [
            'host' => getenv('DB_HOST') ?: 'localhost',
            'user' => getenv('DB_USER') ?: 'u600265163_HAggBlS0j_presupadmin',
            'pass' => getenv('DB_PASS') ?: 'Belchote1@',
            'db'   => getenv('DB_NAME') ?: 'u600265163_HAggBlS0j_presup',
            'port' => (int)(getenv('DB_PORT') ?: 3306)
        ];
    }
}

// SMTP configuration
function getSmtpConfig(): array {
    return [
        'host'   => getenv('SMTP_HOST') ?: '',
        'port'   => (int)(getenv('SMTP_PORT') ?: 587),
        'user'   => getenv('SMTP_USER') ?: '',
        'pass'   => getenv('SMTP_PASS') ?: '',
        'secure' => getenv('SMTP_SECURE') ?: 'tls'
    ];
}

// Application settings
function getAppConfig(): array {
    return [
        'env'   => getenv('APP_ENV') ?: 'production',
        'debug' => getenv('APP_DEBUG') === 'true',
        'url'   => getenv('APP_URL') ?: ''
    ];
}
