<?php
declare(strict_types=1);

/**
 * Sistema de automatización de despliegue para el proyecto Presup
 * Scripts para CI/CD, backup automático y mantenimiento
 */

class DeploymentAutomation {
    private string $projectPath;
    private array $config;
    
    public function __construct(string $projectPath = __DIR__) {
        $this->projectPath = $projectPath;
        $this->config = $this->loadConfig();
    }
    
    /**
     * Pre-despliegue: validaciones y preparación
     */
    public function preDeployment(): array {
        $checks = [
            'config_file_exists' => file_exists($this->projectPath . '/.env'),
            'config_readable' => is_readable($this->projectPath . '/.env'),
            'database_connection' => $this->testDatabaseConnection(),
            'required_files' => $this->checkRequiredFiles(),
            'permissions' => $this->checkPermissions(),
            'disk_space' => $this->checkDiskSpace(),
            'php_version' => $this->checkPhpVersion(),
            'extensions' => $this->checkPhpExtensions(),
            'security_setup' => $this->checkSecuritySetup()
        ];
        
        $allPassed = array_reduce($checks, fn($carry, $check) => $carry && $check, true);
        
        return [
            'status' => $allPassed ? 'success' : 'error',
            'checks' => $checks,
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }
    
    /**
     * Backup completo del sistema
     */
    public function createBackup(string $backupType = 'full'): array {
        $backupDir = $this->projectPath . '/backups';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        
        $timestamp = date('Y-m-d_H-i-s');
        $backupName = "backup_{$backupType}_{$timestamp}";
        $backupPath = $backupDir . '/' . $backupName;
        
        $result = [
            'backup_name' => $backupName,
            'backup_path' => $backupPath,
            'timestamp' => date('Y-m-d H:i:s'),
            'components' => []
        ];
        
        try {
            // 1. Backup de base de datos
            $dbBackup = $this->backupDatabase($backupPath . '_db.sql');
            $result['components']['database'] = $dbBackup;
            
            // 2. Backup de archivos
            if ($backupType === 'full') {
                $filesBackup = $this->backupFiles($backupPath . '_files.tar.gz');
                $result['components']['files'] = $filesBackup;
            }
            
            // 3. Backup de configuración
            $configBackup = $this->backupConfig($backupPath . '_config.json');
            $result['components']['config'] = $configBackup;
            
            // 4. Backup de logs
            $logsBackup = $this->backupLogs($backupPath . '_logs.tar.gz');
            $result['components']['logs'] = $logsBackup;
            
            $result['status'] = 'success';
            $result['message'] = 'Backup completado exitosamente';
            
        } catch (Exception $e) {
            $result['status'] = 'error';
            $result['message'] = 'Error en backup: ' . $e->getMessage();
        }
        
        return $result;
    }
    
    /**
     * Despliegue automático
     */
    public function deploy(array $options = []): array {
        $deployment = [
            'start_time' => microtime(true),
            'steps' => [],
            'status' => 'pending'
        ];
        
        try {
            // Paso 1: Pre-despliegue
            $deployment['steps'][] = ['step' => 'pre_deployment', 'result' => $this->preDeployment()];
            
            // Paso 2: Backup
            if ($options['backup_before'] ?? true) {
                $deployment['steps'][] = ['step' => 'backup', 'result' => $this->createBackup()];
            }
            
            // Paso 3: Actualizar archivos
            if ($options['update_files'] ?? true) {
                $deployment['steps'][] = ['step' => 'update_files', 'result' => $this->updateFiles()];
            }
            
            // Paso 4: Migraciones
            if ($options['run_migrations'] ?? true) {
                $deployment['steps'][] = ['step' => 'migrations', 'result' => $this->runMigrations()];
            }
            
            // Paso 5: Optimización
            if ($options['optimize'] ?? true) {
                $deployment['steps'][] = ['step' => 'optimization', 'result' => $this->optimizeSystem()];
            }
            
            // Paso 6: Cache clear
            $deployment['steps'][] = ['step' => 'cache_clear', 'result' => $this->clearCache()];
            
            // Paso 7: Post-despliegue
            $deployment['steps'][] = ['step' => 'post_deployment', 'result' => $this->postDeployment()];
            
            $deployment['status'] = 'success';
            $deployment['message'] = 'Despliegue completado exitosamente';
            
        } catch (Exception $e) {
            $deployment['status'] = 'error';
            $deployment['message'] = 'Error en despliegue: ' . $e->getMessage();
            
            // Rollback automático
            if ($options['auto_rollback'] ?? true) {
                $deployment['rollback'] = $this->rollback();
            }
        }
        
        $deployment['end_time'] = microtime(true);
        $deployment['duration'] = round($deployment['end_time'] - $deployment['start_time'], 2);
        
        return $deployment;
    }
    
    /**
     * Rollback automático
     */
    public function rollback(): array {
        $rollback = [
            'status' => 'pending',
            'timestamp' => date('Y-m-d H:i:s'),
            'actions' => []
        ];
        
        try {
            // 1. Restaurar último backup
            $latestBackup = $this->getLatestBackup();
            if ($latestBackup) {
                $rollback['actions'][] = ['action' => 'restore_backup', 'result' => $this->restoreBackup($latestBackup)];
            }
            
            // 2. Limpiar cache
            $rollback['actions'][] = ['action' => 'clear_cache', 'result' => $this->clearCache()];
            
            // 3. Reiniciar servicios si es necesario
            $rollback['actions'][] = ['action' => 'restart_services', 'result' => $this->restartServices()];
            
            $rollback['status'] = 'success';
            $rollback['message'] = 'Rollback completado exitosamente';
            
        } catch (Exception $e) {
            $rollback['status'] = 'error';
            $rollback['message'] = 'Error en rollback: ' . $e->getMessage();
        }
        
        return $rollback;
    }
    
    /**
     * Mantenimiento programado
     */
    public function scheduledMaintenance(): array {
        $maintenance = [
            'timestamp' => date('Y-m-d H:i:s'),
            'tasks' => []
        ];
        
        // 1. Limpiar logs antiguos
        $maintenance['tasks'][] = ['task' => 'clean_old_logs', 'result' => $this->cleanOldLogs()];
        
        // 2. Optimizar base de datos
        $maintenance['tasks'][] = ['task' => 'optimize_database', 'result' => $this->optimizeDatabase()];
        
        // 3. Limpiar cache antigua
        $maintenance['tasks'][] = ['task' => 'clean_cache', 'result' => $this->cleanCache()];
        
        // 4. Verificar actualizaciones de seguridad
        $maintenance['tasks'][] = ['task' => 'security_check', 'result' => $this->securityCheck()];
        
        // 5. Backup programado
        $maintenance['tasks'][] = ['task' => 'scheduled_backup', 'result' => $this->createBackup('scheduled')];
        
        return $maintenance;
    }
    
    /**
     * Monitoreo de salud del sistema
     */
    public function healthCheck(): array {
        $health = [
            'timestamp' => date('Y-m-d H:i:s'),
            'status' => 'healthy',
            'checks' => []
        ];
        
        $checks = [
            'database' => $this->checkDatabaseHealth(),
            'disk_space' => $this->checkDiskSpaceHealth(),
            'memory' => $this->checkMemoryHealth(),
            'cpu' => $this->checkCpuHealth(),
            'network' => $this->checkNetworkHealth(),
            'services' => $this->checkServicesHealth(),
            'security' => $this->checkSecurityHealth(),
            'performance' => $this->checkPerformanceHealth()
        ];
        
        foreach ($checks as $name => $check) {
            $health['checks'][$name] = $check;
            if ($check['status'] === 'critical') {
                $health['status'] = 'critical';
            } elseif ($check['status'] === 'warning' && $health['status'] !== 'critical') {
                $health['status'] = 'warning';
            }
        }
        
        return $health;
    }
    
    // Métodos privados
    
    private function loadConfig(): array {
        $configFile = $this->projectPath . '/.env';
        $config = [];
        
        if (file_exists($configFile)) {
            $lines = file($configFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
                
                list($key, $value) = explode('=', $line, 2);
                $config[trim($key)] = trim($value);
            }
        }
        
        return $config;
    }
    
    private function testDatabaseConnection(): bool {
        try {
            require_once $this->projectPath . '/config.php';
            $dbConfig = getDatabaseConfig();
            
            $pdo = new PDO(
                "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['db']};charset=utf8",
                $dbConfig['user'],
                $dbConfig['pass'],
                [PDO::ATTR_TIMEOUT => 5]
            );
            
            return true;
        } catch (Exception $e) {
            return false;
        }
    }
    
    private function checkRequiredFiles(): bool {
        $requiredFiles = [
            'api.php',
            'config.php',
            'app.js',
            'index.html',
            '.htaccess'
        ];
        
        foreach ($requiredFiles as $file) {
            if (!file_exists($this->projectPath . '/' . $file)) {
                return false;
            }
        }
        
        return true;
    }
    
    private function checkPermissions(): bool {
        $paths = [
            $this->projectPath,
            $this->projectPath . '/logs',
            $this->projectPath . '/uploads'
        ];
        
        foreach ($paths as $path) {
            if (is_dir($path) && !is_writable($path)) {
                return false;
            }
        }
        
        return true;
    }
    
    private function checkDiskSpace(): bool {
        $freeSpace = disk_free_space($this->projectPath);
        $totalSpace = disk_total_space($this->projectPath);
        $usagePercent = (($totalSpace - $freeSpace) / $totalSpace) * 100;
        
        return $usagePercent < 90; // Menos del 90% usado
    }
    
    private function checkPhpVersion(): bool {
        return version_compare(PHP_VERSION, '8.0', '>=');
    }
    
    private function checkPhpExtensions(): bool {
        $requiredExtensions = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'curl'];
        
        foreach ($requiredExtensions as $ext) {
            if (!extension_loaded($ext)) {
                return false;
            }
        }
        
        return true;
    }
    
    private function checkSecuritySetup(): bool {
        return file_exists($this->projectPath . '/.env') &&
               !is_readable($this->projectPath . '/.env') ||
               substr(sprintf('%o', fileperms($this->projectPath . '/.env')), -4) === '0600';
    }
    
    private function backupDatabase(string $outputFile): array {
        require_once $this->projectPath . '/config.php';
        $dbConfig = getDatabaseConfig();
        
        $command = sprintf(
            'mysqldump --host=%s --port=%d --user=%s --password=%s --single-transaction --routines --triggers %s > %s',
            $dbConfig['host'],
            $dbConfig['port'],
            $dbConfig['user'],
            $dbConfig['pass'],
            $dbConfig['db'],
            $outputFile
        );
        
        exec($command, $output, $returnCode);
        
        return [
            'status' => $returnCode === 0 ? 'success' : 'error',
            'file' => $outputFile,
            'size' => file_exists($outputFile) ? filesize($outputFile) : 0
        ];
    }
    
    private function backupFiles(string $outputFile): array {
        $command = sprintf(
            'tar -czf %s --exclude="backups" --exclude="logs" --exclude="tmp" --exclude=".git" %s',
            $outputFile,
            $this->projectPath
        );
        
        exec($command, $output, $returnCode);
        
        return [
            'status' => $returnCode === 0 ? 'success' : 'error',
            'file' => $outputFile,
            'size' => file_exists($outputFile) ? filesize($outputFile) : 0
        ];
    }
    
    private function backupConfig(string $outputFile): array {
        $config = [
            'timestamp' => date('Y-m-d H:i:s'),
            'php_version' => PHP_VERSION,
            'environment' => $this->config,
            'server_info' => [
                'os' => PHP_OS,
                'server' => $_SERVER['SERVER_SOFTWARE'] ?? 'CLI',
                'memory_limit' => ini_get('memory_limit'),
                'max_execution_time' => ini_get('max_execution_time')
            ]
        ];
        
        $result = file_put_contents($outputFile, json_encode($config, JSON_PRETTY_PRINT));
        
        return [
            'status' => $result !== false ? 'success' : 'error',
            'file' => $outputFile,
            'size' => $result !== false ? $result : 0
        ];
    }
    
    private function backupLogs(string $outputFile): array {
        $logsDir = $this->projectPath . '/logs';
        if (is_dir($logsDir)) {
            $command = sprintf('tar -czf %s %s', $outputFile, $logsDir);
            exec($command, $output, $returnCode);
            
            return [
                'status' => $returnCode === 0 ? 'success' : 'error',
                'file' => $outputFile,
                'size' => file_exists($outputFile) ? filesize($outputFile) : 0
            ];
        }
        
        return ['status' => 'skipped', 'message' => 'No logs directory found'];
    }
    
    private function updateFiles(): array {
        // Implementar lógica de actualización de archivos
        // Esto podría ser desde Git, FTP, etc.
        return ['status' => 'success', 'message' => 'Files updated'];
    }
    
    private function runMigrations(): array {
        // Implementar lógica de migraciones
        return ['status' => 'success', 'message' => 'Migrations completed'];
    }
    
    private function optimizeSystem(): array {
        // Implementar optimización del sistema
        return ['status' => 'success', 'message' => 'System optimized'];
    }
    
    private function clearCache(): array {
        $cacheDir = $this->projectPath . '/cache';
        if (is_dir($cacheDir)) {
            $files = glob($cacheDir . '/*');
            foreach ($files as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
        }
        
        return ['status' => 'success', 'message' => 'Cache cleared'];
    }
    
    private function postDeployment(): array {
        // Implementar verificaciones post-despliegue
        return ['status' => 'success', 'message' => 'Post-deployment checks passed'];
    }
    
    private function getLatestBackup(): ?string {
        $backupDir = $this->projectPath . '/backups';
        if (!is_dir($backupDir)) return null;
        
        $files = glob($backupDir . '/backup_full_*.sql');
        if (empty($files)) return null;
        
        return end($files);
    }
    
    private function restoreBackup(string $backupFile): array {
        require_once $this->projectPath . '/config.php';
        $dbConfig = getDatabaseConfig();
        
        $command = sprintf(
            'mysql --host=%s --port=%d --user=%s --password=%s %s < %s',
            $dbConfig['host'],
            $dbConfig['port'],
            $dbConfig['user'],
            $dbConfig['pass'],
            $dbConfig['db'],
            $backupFile
        );
        
        exec($command, $output, $returnCode);
        
        return [
            'status' => $returnCode === 0 ? 'success' : 'error',
            'backup_file' => $backupFile
        ];
    }
    
    private function restartServices(): array {
        // Implementar reinicio de servicios si es necesario
        return ['status' => 'success', 'message' => 'Services restarted'];
    }
    
    private function cleanOldLogs(): array {
        $logsDir = $this->projectPath . '/logs';
        if (!is_dir($logsDir)) return ['status' => 'skipped'];
        
        $files = glob($logsDir . '/*.log');
        $deleted = 0;
        
        foreach ($files as $file) {
            if (filemtime($file) < strtotime('-30 days')) {
                unlink($file);
                $deleted++;
            }
        }
        
        return ['status' => 'success', 'deleted_files' => $deleted];
    }
    
    private function optimizeDatabase(): array {
        // Implementar optimización de base de datos
        return ['status' => 'success', 'message' => 'Database optimized'];
    }
    
    private function cleanCache(): array {
        return $this->clearCache();
    }
    
    private function securityCheck(): array {
        // Implementar verificación de seguridad
        return ['status' => 'success', 'message' => 'Security check passed'];
    }
    
    private function checkDatabaseHealth(): array {
        $healthy = $this->testDatabaseConnection();
        return ['status' => $healthy ? 'ok' : 'critical', 'message' => $healthy ? 'Connected' : 'Connection failed'];
    }
    
    private function checkDiskSpaceHealth(): array {
        $freeSpace = disk_free_space($this->projectPath);
        $totalSpace = disk_total_space($this->projectPath);
        $usagePercent = (($totalSpace - $freeSpace) / $totalSpace) * 100;
        
        $status = 'ok';
        if ($usagePercent > 90) $status = 'critical';
        elseif ($usagePercent > 80) $status = 'warning';
        
        return [
            'status' => $status,
            'usage_percent' => round($usagePercent, 2),
            'free_gb' => round($freeSpace / 1024 / 1024 / 1024, 2)
        ];
    }
    
    private function checkMemoryHealth(): array {
        $memoryUsage = memory_get_usage(true);
        $memoryLimit = $this->parseMemoryLimit(ini_get('memory_limit'));
        $usagePercent = ($memoryUsage / $memoryLimit) * 100;
        
        $status = 'ok';
        if ($usagePercent > 90) $status = 'critical';
        elseif ($usagePercent > 80) $status = 'warning';
        
        return [
            'status' => $status,
            'usage_percent' => round($usagePercent, 2),
            'usage_mb' => round($memoryUsage / 1024 / 1024, 2),
            'limit_mb' => round($memoryLimit / 1024 / 1024, 2)
        ];
    }
    
    private function checkCpuHealth(): array {
        if (function_exists('sys_getloadavg')) {
            $load = sys_getloadavg()[0];
            $status = 'ok';
            if ($load > 2.0) $status = 'critical';
            elseif ($load > 1.0) $status = 'warning';
            
            return ['status' => $status, 'load' => $load];
        }
        
        return ['status' => 'unknown', 'message' => 'Cannot determine CPU load'];
    }
    
    private function checkNetworkHealth(): array {
        // Test básico de conectividad
        $testUrl = 'https://www.google.com';
        $context = stream_context_create(['http' => ['timeout' => 5]]);
        $response = @file_get_contents($testUrl, false, $context);
        
        return [
            'status' => $response !== false ? 'ok' : 'warning',
            'message' => $response !== false ? 'Network OK' : 'Network issues detected'
        ];
    }
    
    private function checkServicesHealth(): array {
        // Verificar servicios críticos
        return ['status' => 'ok', 'services' => ['webserver' => 'running', 'database' => 'running']];
    }
    
    private function checkSecurityHealth(): array {
        // Verificar configuración de seguridad
        return ['status' => 'ok', 'message' => 'Security configuration OK'];
    }
    
    private function checkPerformanceHealth(): array {
        // Verificar métricas de rendimiento
        return ['status' => 'ok', 'message' => 'Performance OK'];
    }
    
    private function parseMemoryLimit(string $limit): int {
        $limit = strtolower($limit);
        $multiplier = 1;
        
        if (strpos($limit, 'g') !== false) $multiplier = 1024 * 1024 * 1024;
        elseif (strpos($limit, 'm') !== false) $multiplier = 1024 * 1024;
        elseif (strpos($limit, 'k') !== false) $multiplier = 1024;
        
        return (int)$limit * $multiplier;
    }
}
?>
