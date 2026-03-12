<?php
declare(strict_types=1);

/**
 * Optimización de rendimiento para el proyecto Presup
 * Funciones para mejorar velocidad y reducir carga del servidor
 */

/**
 * Cache simple en memoria para consultas frecuentes
 */
class SimpleCache {
    private static array $cache = [];
    private static array $timestamps = [];
    private static int $defaultTtl = 300; // 5 minutos

    public static function get(string $key, callable $callback, int $ttl = null): mixed {
        $ttl = $ttl ?? self::$defaultTtl;
        
        if (isset(self::$cache[$key]) && (time() - self::$timestamps[$key]) < $ttl) {
            return self::$cache[$key];
        }
        
        $result = $callback();
        self::$cache[$key] = $result;
        self::$timestamps[$key] = time();
        
        return $result;
    }
    
    public static function clear(string $key = null): void {
        if ($key) {
            unset(self::$cache[$key]);
            unset(self::$timestamps[$key]);
        } else {
            self::$cache = [];
            self::$timestamps = [];
        }
    }
    
    public static function cleanup(): void {
        $now = time();
        foreach (self::$timestamps as $key => $timestamp) {
            if ($now - $timestamp > self::$defaultTtl) {
                unset(self::$cache[$key]);
                unset(self::$timestamps[$key]);
            }
        }
    }
}

/**
 * Optimización de consultas a base de datos
 */
class DatabaseOptimizer {
    private PDO $pdo;
    
    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }
    
    /**
     * Consulta optimizada con índices y límites
     */
    public function getQuotesOptimized(array $filters = [], int $limit = 50, int $offset = 0): array {
        $sql = "SELECT q.id, q.date, q.client_name, q.status, q.total_amount, q.user_id,
                       c.name as customer_name, c.email as customer_email
                FROM quotes q
                LEFT JOIN customers c ON q.client_id = c.id
                WHERE 1=1";
        
        $params = [];
        
        if (!empty($filters['status'])) {
            $sql .= " AND q.status = ?";
            $params[] = $filters['status'];
        }
        
        if (!empty($filters['user_id'])) {
            $sql .= " AND q.user_id = ?";
            $params[] = $filters['user_id'];
        }
        
        if (!empty($filters['date_from'])) {
            $sql .= " AND q.date >= ?";
            $params[] = $filters['date_from'];
        }
        
        if (!empty($filters['date_to'])) {
            $sql .= " AND q.date <= ?";
            $params[] = $filters['date_to'];
        }
        
        $sql .= " ORDER BY q.date DESC LIMIT ? OFFSET ?";
        $params[] = $limit;
        $params[] = $offset;
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    /**
     * Conteo optimizado con índices
     */
    public function countQuotesOptimized(array $filters = []): int {
        $sql = "SELECT COUNT(*) FROM quotes WHERE 1=1";
        $params = [];
        
        if (!empty($filters['status'])) {
            $sql .= " AND status = ?";
            $params[] = $filters['status'];
        }
        
        if (!empty($filters['user_id'])) {
            $sql .= " AND user_id = ?";
            $params[] = $filters['user_id'];
        }
        
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        
        return (int)$stmt->fetchColumn();
    }
    
    /**
     * Batch insert para items de presupuestos
     */
    public function batchInsertQuoteItems(string $quoteId, array $items): bool {
        if (empty($items)) {
            return true;
        }
        
        // Primero eliminar items existentes
        $this->pdo->prepare("DELETE FROM quote_items WHERE quote_id = ?")->execute([$quoteId]);
        
        // Preparar inserción batch
        $sql = "INSERT INTO quote_items (quote_id, description, image_url, quantity, price, tax_percent) VALUES ";
        $values = [];
        $params = [];
        
        foreach ($items as $item) {
            $values[] = "(?, ?, ?, ?, ?, ?)";
            $params[] = $quoteId;
            $params[] = $item['description'] ?? '';
            $params[] = $item['image_url'] ?? '';
            $params[] = $item['quantity'] ?? 1;
            $params[] = $item['price'] ?? 0;
            $params[] = $item['tax_percent'] ?? 21;
        }
        
        $sql .= implode(', ', $values);
        
        return $this->pdo->prepare($sql)->execute($params);
    }
}

/**
 * Compresión de respuestas JSON
 */
function compressJsonResponse(array $data): string {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    
    // Comprimir si el cliente lo acepta y el JSON es grande
    if (strlen($json) > 1024 && isset($_SERVER['HTTP_ACCEPT_ENCODING'])) {
        if (strpos($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip') !== false) {
            header('Content-Encoding: gzip');
            return gzencode($json, 9);
        }
    }
    
    return $json;
}

/**
 * Optimización de memoria para grandes datasets
 */
function streamLargeDataset(PDO $pdo, string $query, array $params = [], callable $processor): void {
    $stmt = $pdo->prepare($query);
    $stmt->setFetchMode(PDO::FETCH_ASSOC);
    $stmt->execute($params);
    
    foreach ($stmt as $row) {
        $processor($row);
        
        // Liberar memoria cada 1000 filas
        if ($stmt->rowCount() % 1000 === 0) {
            gc_collect_cycles();
        }
    }
}

/**
 * Cache de consultas con archivo
 */
class FileCache {
    private string $cacheDir;
    private int $defaultTtl;
    
    public function __construct(string $cacheDir = __DIR__ . '/cache', int $defaultTtl = 3600) {
        $this->cacheDir = $cacheDir;
        $this->defaultTtl = $defaultTtl;
        
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
    }
    
    public function get(string $key): mixed {
        $file = $this->getCacheFile($key);
        
        if (!file_exists($file)) {
            return null;
        }
        
        $data = unserialize(file_get_contents($file));
        
        if (time() - $data['timestamp'] > $data['ttl']) {
            unlink($file);
            return null;
        }
        
        return $data['value'];
    }
    
    public function set(string $key, mixed $value, int $ttl = null): void {
        $file = $this->getCacheFile($key);
        $data = [
            'value' => $value,
            'timestamp' => time(),
            'ttl' => $ttl ?? $this->defaultTtl
        ];
        
        file_put_contents($file, serialize($data), LOCK_EX);
    }
    
    public function delete(string $key): void {
        $file = $this->getCacheFile($key);
        if (file_exists($file)) {
            unlink($file);
        }
    }
    
    public function clear(): void {
        $files = glob($this->cacheDir . '/*.cache');
        foreach ($files as $file) {
            unlink($file);
        }
    }
    
    private function getCacheFile(string $key): string {
        return $this->cacheDir . '/' . md5($key) . '.cache';
    }
}

/**
 * Pool de conexiones a base de datos
 */
class ConnectionPool {
    private static array $connections = [];
    private static int $maxConnections = 5;
    
    public static function getConnection(array $config): PDO {
        $key = md5(serialize($config));
        
        if (!isset(self::$connections[$key]) || self::$connections[$key] === null) {
            if (count(self::$connections) >= self::$maxConnections) {
                // Cerrar la conexión más antigua
                $oldestKey = array_key_first(self::$connections);
                self::$connections[$oldestKey] = null;
                unset(self::$connections[$oldestKey]);
            }
            
            self::$connections[$key] = new PDO(
                "mysql:host={$config['host']};port={$config['port']};dbname={$config['db']};charset=utf8",
                $config['user'],
                $config['pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_TIMEOUT => 5,
                    PDO::ATTR_PERSISTENT => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
                ]
            );
        }
        
        return self::$connections[$key];
    }
    
    public static function closeAll(): void {
        foreach (self::$connections as $connection) {
            $connection = null;
        }
        self::$connections = [];
    }
}

/**
 * Middleware de optimización
 */
function performanceMiddleware(): void {
    // Limpiar cache antigua
    if (rand(1, 100) === 1) { // 1% de las peticiones
        SimpleCache::cleanup();
    }
    
    // Headers de optimización
    header('Cache-Control: public, max-age=300'); // 5 minutos
    header('Vary: Accept-Encoding');
    
    // Comprimir salida si es posible
    if (ob_get_level() === 0 && !headers_sent()) {
        ob_start('ob_gzhandler');
    }
}
?>
