<?php
declare(strict_types=1);

/**
 * Funciones de validación de seguridad para el proyecto Presup
 * Incluir en archivos que necesiten validación de entrada
 */

/**
 * Valida de forma segura la entrada de usuario
 */
function validateInput(string $input, string $type = 'string'): string|int|float|bool {
    return match($type) {
        'email' => filter_var($input, FILTER_VALIDATE_EMAIL) !== false ? $input : '',
        'int' => filter_var($input, FILTER_VALIDATE_INT) !== false ? (int)$input : 0,
        'float' => filter_var($input, FILTER_VALIDATE_FLOAT) !== false ? (float)$input : 0.0,
        'boolean' => filter_var($input, FILTER_VALIDATE_BOOLEAN),
        'url' => filter_var($input, FILTER_VALIDATE_URL) !== false ? $input : '',
        'string' => htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8'),
        'alpha' => preg_match('/^[a-zA-Z]+$/', $input) ? $input : '',
        'alphanum' => preg_match('/^[a-zA-Z0-9]+$/', $input) ? $input : '',
        'filename' => preg_match('/^[a-zA-Z0-9._-]+$/', $input) ? $input : '',
        default => throw new InvalidArgumentException("Invalid validation type: $type")
    };
}

/**
 * Validación segura para file_get_contents()
 */
function safeFileGetContents(string $filename): string|false {
    $allowedPaths = [
        __DIR__ . '/logs/',
        __DIR__ . '/uploads/',
        __DIR__ . '/temp/',
        __DIR__ . '/tmp/',
        __DIR__ . '/api.php'
    ];
    
    $realPath = realpath($filename);
    if ($realPath === false) {
        return false;
    }
    
    foreach ($allowedPaths as $allowedPath) {
        $allowedRealPath = realpath($allowedPath);
        if ($allowedRealPath !== false && strpos($realPath, $allowedRealPath) === 0) {
            return file_get_contents($filename);
        }
    }
    
    error_log("Intento de acceso a archivo no permitido: $filename");
    return false;
}

/**
 * Validación de IDs de presupuesto/factura
 */
function validateDocumentId(string $id): bool {
    // Formatos válidos: PRE-XXXXXXXXXXXX, FAC-XXXXXXXXXXXX
    return preg_match('/^(PRE|FAC)-\d{13}$/', $id) === 1;
}

/**
 * Validación de nombres de usuario
 */
function validateUsername(string $username): bool {
    // 3-50 caracteres, alfanuméricos y guiones bajos
    return preg_match('/^[a-zA-Z0-9_]{3,50}$/', $username) === 1;
}

/**
 * Validación de contraseñas
 */
function validatePassword(string $password): array {
    $errors = [];
    
    if (strlen($password) < 8) {
        $errors[] = 'Mínimo 8 caracteres';
    }
    
    if (!preg_match('/[A-Z]/', $password)) {
        $errors[] = 'Al menos una mayúscula';
    }
    
    if (!preg_match('/[a-z]/', $password)) {
        $errors[] = 'Al menos una minúscula';
    }
    
    if (!preg_match('/[0-9]/', $password)) {
        $errors[] = 'Al menos un número';
    }
    
    return $errors;
}

/**
 * Sanitización de datos para base de datos
 */
function sanitizeForDatabase(array $data): array {
    $sanitized = [];
    foreach ($data as $key => $value) {
        if (is_string($value)) {
            $sanitized[$key] = trim($value);
        } elseif (is_array($value)) {
            $sanitized[$key] = sanitizeForDatabase($value);
        } else {
            $sanitized[$key] = $value;
        }
    }
    return $sanitized;
}

/**
 * Validación de importes monetarios
 */
function validateAmount(float|string $amount): bool {
    $amount = is_string($amount) ? (float)$amount : $amount;
    return $amount >= 0 && $amount <= 999999.99;
}

/**
 * Generación de token seguro
 */
function generateSecureToken(int $length = 32): string {
    return bin2hex(random_bytes($length));
}

/**
 * Verificación de CSRF token
 */
function verifyCsrfToken(string $token): bool {
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

/**
 * Generación de CSRF token
 */
function generateCsrfToken(): string {
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = generateSecureToken();
    }
    return $_SESSION['csrf_token'];
}
?>
