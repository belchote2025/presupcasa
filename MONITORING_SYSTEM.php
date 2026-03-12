<?php
declare(strict_types=1);

/**
 * Sistema de monitoreo y logging para el proyecto Presup
 * Métricas de rendimiento, errores y seguridad
 */

class MonitoringSystem {
    private static array $metrics = [];
    private static float $startTime;
    private static array $config;
    
    public static function init(array $config = []): void {
        self::$startTime = microtime(true);
        self::$config = array_merge([
            'log_file' => __DIR__ . '/logs/monitoring.log',
            'metrics_file' => __DIR__ . '/logs/metrics.json',
            'alert_thresholds' => [
                'response_time' => 5.0, // segundos
                'memory_usage' => 128 * 1024 * 1024, // 128MB
                'error_rate' => 0.05 // 5%
            ]
        ], $config);
        
        // Crear directorio de logs si no existe
        $logDir = dirname(self::$config['log_file']);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }
    }
    
    /**
     * Registrar métricas de rendimiento
     */
    public static function logPerformance(string $action, array $data = []): void {
        $executionTime = microtime(true) - self::$startTime;
        $memoryUsage = memory_get_usage(true);
        $peakMemory = memory_get_peak_usage(true);
        
        $metric = [
            'timestamp' => date('Y-m-d H:i:s'),
            'action' => $action,
            'execution_time' => round($executionTime, 4),
            'memory_usage' => $memoryUsage,
            'peak_memory' => $peakMemory,
            'data' => $data
        ];
        
        self::$metrics[] = $metric;
        
        // Verificar umbrales de alerta
        self::checkAlerts($metric);
        
        // Guardar métricas en archivo
        self::saveMetrics();
    }
    
    /**
     * Registrar errores
     */
    public static function logError(string $message, array $context = [], string $level = 'ERROR'): void {
        $logEntry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'level' => $level,
            'message' => $message,
            'context' => $context,
            'request' => [
                'method' => $_SERVER['REQUEST_METHOD'] ?? 'CLI',
                'uri' => $_SERVER['REQUEST_URI'] ?? '',
                'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
            ]
        ];
        
        self::writeLog($logEntry);
    }
    
    /**
     * Registrar eventos de seguridad
     */
    public static function logSecurity(string $event, array $context = []): void {
        $securityLog = [
            'timestamp' => date('Y-m-d H:i:s'),
            'event' => $event,
            'severity' => self::getSecuritySeverity($event),
            'context' => $context,
            'request' => [
                'method' => $_SERVER['REQUEST_METHOD'] ?? 'CLI',
                'uri' => $_SERVER['REQUEST_URI'] ?? '',
                'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? '',
                'user_id' => $_SESSION['user_id'] ?? null
            ]
        ];
        
        self::writeLog($securityLog, 'security');
        
        // Alerta inmediata para eventos críticos
        if (in_array($securityLog['severity'], ['CRITICAL', 'HIGH'])) {
            self::sendAlert($securityLog);
        }
    }
    
    /**
     * Obtener estadísticas del sistema
     */
    public static function getStats(): array {
        $stats = [
            'uptime' => self::getUptime(),
            'memory_usage' => memory_get_usage(true),
            'peak_memory' => memory_get_peak_usage(true),
            'active_sessions' => self::getActiveSessions(),
            'database_connections' => self::getDatabaseConnections(),
            'error_rate' => self::getErrorRate(),
            'avg_response_time' => self::getAverageResponseTime(),
            'requests_per_minute' => self::getRequestsPerMinute()
        ];
        
        return $stats;
    }
    
    /**
     * Generar reporte de salud del sistema
     */
    public static function healthCheck(): array {
        $stats = self::getStats();
        $health = [
            'status' => 'healthy',
            'checks' => [
                'memory' => [
                    'status' => $stats['memory_usage'] < self::$config['alert_thresholds']['memory_usage'] ? 'ok' : 'warning',
                    'value' => self::formatBytes($stats['memory_usage']),
                    'threshold' => self::formatBytes(self::$config['alert_thresholds']['memory_usage'])
                ],
                'response_time' => [
                    'status' => $stats['avg_response_time'] < self::$config['alert_thresholds']['response_time'] ? 'ok' : 'warning',
                    'value' => round($stats['avg_response_time'], 3) . 's',
                    'threshold' => self::$config['alert_thresholds']['response_time'] . 's'
                ],
                'error_rate' => [
                    'status' => $stats['error_rate'] < self::$config['alert_thresholds']['error_rate'] ? 'ok' : 'critical',
                    'value' => round($stats['error_rate'] * 100, 2) . '%',
                    'threshold' => round(self::$config['alert_thresholds']['error_rate'] * 100, 2) . '%'
                ],
                'database' => [
                    'status' => self::checkDatabaseConnection() ? 'ok' : 'critical',
                    'value' => $stats['database_connections'],
                    'message' => self::checkDatabaseConnection() ? 'Connected' : 'Connection failed'
                ]
            ]
        ];
        
        // Determinar estado general
        foreach ($health['checks'] as $check) {
            if ($check['status'] === 'critical') {
                $health['status'] = 'critical';
                break;
            } elseif ($check['status'] === 'warning' && $health['status'] !== 'critical') {
                $health['status'] = 'warning';
            }
        }
        
        return $health;
    }
    
    /**
     * Obtener endpoint de monitoreo
     */
    public static function getMonitoringEndpoint(): array {
        return [
            'timestamp' => date('Y-m-d H:i:s'),
            'stats' => self::getStats(),
            'health' => self::healthCheck(),
            'recent_errors' => self::getRecentErrors(10),
            'recent_security_events' => self::getRecentSecurityEvents(10)
        ];
    }
    
    // Métodos privados
    
    private static function writeLog(array $data, string $type = 'general'): void {
        $logFile = $type === 'security' ? 
            str_replace('.log', '_security.log', self::$config['log_file']) : 
            self::$config['log_file'];
        
        $logLine = json_encode($data) . "\n";
        file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    }
    
    private static function saveMetrics(): void {
        if (count(self::$metrics) % 10 === 0) { // Guardar cada 10 métricas
            file_put_contents(self::$config['metrics_file'], json_encode(self::$metrics), LOCK_EX);
        }
    }
    
    private static function checkAlerts(array $metric): void {
        $thresholds = self::$config['alert_thresholds'];
        
        if ($metric['execution_time'] > $thresholds['response_time']) {
            self::sendAlert([
                'type' => 'performance',
                'message' => 'Slow response time detected',
                'metric' => $metric
            ]);
        }
        
        if ($metric['memory_usage'] > $thresholds['memory_usage']) {
            self::sendAlert([
                'type' => 'performance',
                'message' => 'High memory usage detected',
                'metric' => $metric
            ]);
        }
    }
    
    private static function sendAlert(array $alert): void {
        $alertData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'alert' => $alert,
            'server' => [
                'hostname' => gethostname(),
                'php_version' => PHP_VERSION,
                'memory_limit' => ini_get('memory_limit')
            ]
        ];
        
        // Guardar alerta en archivo separado
        $alertFile = str_replace('.log', '_alerts.log', self::$config['log_file']);
        file_put_contents($alertFile, json_encode($alertData) . "\n", FILE_APPEND | LOCK_EX);
        
        // Enviar email si está configurado
        $adminEmail = getenv('ADMIN_EMAIL');
        if ($adminEmail && filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
            $subject = 'Alert: ' . $alert['message'];
            $message = json_encode($alertData, JSON_PRETTY_PRINT);
            mail($adminEmail, $subject, $message);
        }
    }
    
    private static function getSecuritySeverity(string $event): string {
        $criticalEvents = ['brute_force', 'sql_injection', 'xss_attempt', 'file_inclusion'];
        $highEvents = ['rate_limit_exceeded', 'invalid_token', 'privilege_escalation'];
        $mediumEvents = ['failed_login', 'suspicious_activity'];
        
        if (in_array($event, $criticalEvents)) return 'CRITICAL';
        if (in_array($event, $highEvents)) return 'HIGH';
        if (in_array($event, $mediumEvents)) return 'MEDIUM';
        return 'LOW';
    }
    
    private static function formatBytes(int $bytes): string {
        $units = ['B', 'KB', 'MB', 'GB'];
        $unitIndex = 0;
        
        while ($bytes >= 1024 && $unitIndex < count($units) - 1) {
            $bytes /= 1024;
            $unitIndex++;
        }
        
        return round($bytes, 2) . ' ' . $units[$unitIndex];
    }
    
    private static function getUptime(): string {
        if (function_exists('sys_getloadavg')) {
            $load = sys_getloadavg();
            return $load[0] ?? 'N/A';
        }
        return 'N/A';
    }
    
    private static function getActiveSessions(): int {
        $sessionDir = session_save_path();
        if ($sessionDir && is_dir($sessionDir)) {
            return count(glob($sessionDir . '/sess_*'));
        }
        return 0;
    }
    
    private static function getDatabaseConnections(): int {
        // Esto requeriría implementación específica según tu sistema
        return 1; // Placeholder
    }
    
    private static function getErrorRate(): float {
        // Calcular tasa de errores de las últimas 100 peticiones
        $totalRequests = count(self::$metrics);
        $errorRequests = array_filter(self::$metrics, fn($m) => 
            isset($m['data']['error']) && $m['data']['error'] === true
        );
        
        return $totalRequests > 0 ? count($errorRequests) / $totalRequests : 0;
    }
    
    private static function getAverageResponseTime(): float {
        if (empty(self::$metrics)) return 0;
        
        $totalTime = array_sum(array_column(self::$metrics, 'execution_time'));
        return $totalTime / count(self::$metrics);
    }
    
    private static function getRequestsPerMinute(): float {
        if (empty(self::$metrics)) return 0;
        
        $latest = end(self::$metrics);
        $earliest = reset(self::$metrics);
        
        if ($latest && $earliest) {
            $timeDiff = strtotime($latest['timestamp']) - strtotime($earliest['timestamp']);
            return $timeDiff > 0 ? (count(self::$metrics) / $timeDiff) * 60 : 0;
        }
        
        return 0;
    }
    
    private static function checkDatabaseConnection(): bool {
        try {
            $dbConfig = getDatabaseConfig();
            $pdo = new PDO(
                "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['db']};charset=utf8",
                $dbConfig['user'],
                $dbConfig['pass'],
                [PDO::ATTR_TIMEOUT => 2]
            );
            return true;
        } catch (Exception $e) {
            return false;
        }
    }
    
    private static function getRecentErrors(int $limit = 10): array {
        $logFile = self::$config['log_file'];
        if (!file_exists($logFile)) return [];
        
        $lines = array_reverse(file($logFile));
        $errors = [];
        
        foreach ($lines as $line) {
            if (count($errors) >= $limit) break;
            
            $entry = json_decode(trim($line), true);
            if ($entry && isset($entry['level']) && $entry['level'] === 'ERROR') {
                $errors[] = $entry;
            }
        }
        
        return $errors;
    }
    
    private static function getRecentSecurityEvents(int $limit = 10): array {
        $logFile = str_replace('.log', '_security.log', self::$config['log_file']);
        if (!file_exists($logFile)) return [];
        
        $lines = array_reverse(file($logFile));
        $events = [];
        
        foreach ($lines as $line) {
            if (count($events) >= $limit) break;
            
            $event = json_decode(trim($line), true);
            if ($event) {
                $events[] = $event;
            }
        }
        
        return $events;
    }
}
?>
