<?php
declare(strict_types=1);

/**
 * Script de despliegue automatizado
 * Uso: php deploy.php [action] [options]
 */

require_once __DIR__ . '/DEPLOYMENT_AUTOMATION.php';

class DeployScript {
    private DeploymentAutomation $deployer;
    
    public function __construct() {
        $this->deployer = new DeploymentAutomation();
    }
    
    public function run(array $args): void {
        $action = $args[1] ?? 'help';
        
        switch ($action) {
            case 'pre-check':
                $this->preCheck();
                break;
                
            case 'backup':
                $this->backup();
                break;
                
            case 'deploy':
                $this->deploy($args);
                break;
                
            case 'rollback':
                $this->rollback();
                break;
                
            case 'maintenance':
                $this->maintenance();
                break;
                
            case 'health':
                $this->healthCheck();
                break;
                
            case 'status':
                $this->status();
                break;
                
            default:
                $this->help();
                break;
        }
    }
    
    private function preCheck(): void {
        echo "🔍 Realizando verificación pre-despliegue...\n\n";
        
        $result = $this->deployer->preDeployment();
        
        echo "Estado: " . strtoupper($result['status']) . "\n";
        echo "Timestamp: {$result['timestamp']}\n\n";
        
        echo "Verificaciones:\n";
        foreach ($result['checks'] as $check => $status) {
            $icon = $status ? '✅' : '❌';
            echo "  $icon $check: " . ($status ? 'OK' : 'FAIL') . "\n";
        }
        
        if ($result['status'] === 'error') {
            echo "\n❌ Algunas verificaciones fallaron. Corrige los problemas antes de continuar.\n";
            exit(1);
        } else {
            echo "\n✅ Todas las verificaciones pasaron. Listo para desplegar.\n";
        }
    }
    
    private function backup(): void {
        $type = $GLOBALS['argv'][2] ?? 'full';
        echo "📦 Creando backup ($type)...\n\n";
        
        $result = $this->deployer->createBackup($type);
        
        echo "Estado: " . strtoupper($result['status']) . "\n";
        echo "Backup: {$result['backup_name']}\n";
        echo "Timestamp: {$result['timestamp']}\n\n";
        
        if ($result['status'] === 'success') {
            echo "Componentes backup:\n";
            foreach ($result['components'] as $component => $data) {
                $icon = $data['status'] === 'success' ? '✅' : '❌';
                echo "  $icon $component: {$data['status']}\n";
                if (isset($data['size'])) {
                    echo "    Size: " . $this->formatBytes($data['size']) . "\n";
                }
            }
            echo "\n✅ Backup completado exitosamente.\n";
        } else {
            echo "❌ Error: {$result['message']}\n";
            exit(1);
        }
    }
    
    private function deploy(array $args): void {
        echo "🚀 Iniciando despliegue...\n\n";
        
        $options = $this->parseDeployOptions($args);
        
        $result = $this->deployer->deploy($options);
        
        echo "Estado: " . strtoupper($result['status']) . "\n";
        echo "Duración: {$result['duration']}s\n";
        echo "Timestamp: " . date('Y-m-d H:i:s') . "\n\n";
        
        echo "Pasos ejecutados:\n";
        foreach ($result['steps'] as $step) {
            $icon = $step['result']['status'] === 'success' ? '✅' : '❌';
            echo "  $icon {$step['step']}: {$step['result']['status']}\n";
            if (isset($step['result']['message'])) {
                echo "    {$step['result']['message']}\n";
            }
        }
        
        if ($result['status'] === 'success') {
            echo "\n✅ Despliegue completado exitosamente.\n";
        } else {
            echo "\n❌ Error en despliegue: {$result['message']}\n";
            if (isset($result['rollback'])) {
                echo "🔄 Rollback ejecutado.\n";
            }
            exit(1);
        }
    }
    
    private function rollback(): void {
        echo "🔄 Ejecutando rollback...\n\n";
        
        $result = $this->deployer->rollback();
        
        echo "Estado: " . strtoupper($result['status']) . "\n";
        echo "Timestamp: {$result['timestamp']}\n\n";
        
        echo "Acciones ejecutadas:\n";
        foreach ($result['actions'] as $action) {
            $icon = $action['result']['status'] === 'success' ? '✅' : '❌';
            echo "  $icon {$action['action']}: {$action['result']['status']}\n";
            if (isset($action['result']['message'])) {
                echo "    {$action['result']['message']}\n";
            }
        }
        
        if ($result['status'] === 'success') {
            echo "\n✅ Rollback completado exitosamente.\n";
        } else {
            echo "\n❌ Error en rollback: {$result['message']}\n";
            exit(1);
        }
    }
    
    private function maintenance(): void {
        echo "🔧 Ejecutando mantenimiento programado...\n\n";
        
        $result = $this->deployer->scheduledMaintenance();
        
        echo "Timestamp: {$result['timestamp']}\n\n";
        
        echo "Tareas ejecutadas:\n";
        foreach ($result['tasks'] as $task) {
            $icon = $task['result']['status'] === 'success' ? '✅' : '❌';
            echo "  $icon {$task['task']}: {$task['result']['status']}\n";
            if (isset($task['result']['message'])) {
                echo "    {$task['result']['message']}\n";
            }
        }
        
        echo "\n✅ Mantenimiento completado.\n";
    }
    
    private function healthCheck(): void {
        echo "🏥 Verificando salud del sistema...\n\n";
        
        $result = $this->deployer->healthCheck();
        
        $icon = $result['status'] === 'healthy' ? '✅' : 
                ($result['status'] === 'warning' ? '⚠️' : '❌');
        
        echo "$icon Estado general: {$result['status']}\n";
        echo "Timestamp: {$result['timestamp']}\n\n";
        
        echo "Verificaciones de salud:\n";
        foreach ($result['checks'] as $check => $data) {
            $icon = $data['status'] === 'ok' ? '✅' : 
                    ($data['status'] === 'warning' ? '⚠️' : '❌');
            echo "  $icon $check: {$data['status']}\n";
            if (isset($data['message'])) {
                echo "    {$data['message']}\n";
            }
            if (isset($data['usage_percent'])) {
                echo "    Uso: {$data['usage_percent']}%\n";
            }
        }
        
        if ($result['status'] === 'critical') {
            echo "\n❌ Problemas críticos detectados. Requiere atención inmediata.\n";
            exit(1);
        } elseif ($result['status'] === 'warning') {
            echo "\n⚠️ Advertencias detectadas. Monitorear situación.\n";
        } else {
            echo "\n✅ Sistema saludable.\n";
        }
    }
    
    private function status(): void {
        echo "📊 Estado actual del sistema\n";
        echo "========================\n\n";
        
        // Información básica
        echo "Proyecto: Presup (NAVEGA360PRO)\n";
        echo "PHP Version: " . PHP_VERSION . "\n";
        echo "Sistema: " . PHP_OS . "\n";
        echo "Directorio: " . __DIR__ . "\n";
        echo "Timestamp: " . date('Y-m-d H:i:s') . "\n\n";
        
        // Health check
        $health = $this->deployer->healthCheck();
        echo "Salud del sistema: {$health['status']}\n\n";
        
        // Espacio en disco
        $freeSpace = disk_free_space(__DIR__);
        $totalSpace = disk_total_space(__DIR__);
        $usedSpace = $totalSpace - $freeSpace;
        $usagePercent = ($usedSpace / $totalSpace) * 100;
        
        echo "Espacio en disco:\n";
        echo "  Total: " . $this->formatBytes($totalSpace) . "\n";
        echo "  Usado: " . $this->formatBytes($usedSpace) . " ($usagePercent%)\n";
        echo "  Libre: " . $this->formatBytes($freeSpace) . "\n\n";
        
        // Memoria
        $memoryUsage = memory_get_usage(true);
        $memoryLimit = $this->parseMemoryLimit(ini_get('memory_limit'));
        $memoryUsagePercent = ($memoryUsage / $memoryLimit) * 100;
        
        echo "Memoria:\n";
        echo "  Uso actual: " . $this->formatBytes($memoryUsage) . " ($memoryUsagePercent%)\n";
        echo "  Límite: " . $this->formatBytes($memoryLimit) . "\n\n";
        
        // Logs
        $logsDir = __DIR__ . '/logs';
        if (is_dir($logsDir)) {
            $logFiles = glob($logsDir . '/*.log');
            echo "Logs (" . count($logFiles) . " archivos):\n";
            foreach (array_slice($logFiles, 0, 5) as $logFile) {
                $size = filesize($logFile);
                $name = basename($logFile);
                echo "  $name: " . $this->formatBytes($size) . "\n";
            }
            if (count($logFiles) > 5) {
                echo "  ... y " . (count($logFiles) - 5) . " archivos más\n";
            }
        }
        
        echo "\n✅ Estado obtenido.\n";
    }
    
    private function help(): void {
        echo "🚀 Script de Despliegue Automatizado - Presup\n";
        echo "==========================================\n\n";
        
        echo "Uso: php deploy.php [acción] [opciones]\n\n";
        
        echo "Acciones disponibles:\n";
        echo "  pre-check        Verificación pre-despliegue\n";
        echo "  backup [type]    Crear backup (full|scheduled)\n";
        echo "  deploy           Despliegue completo\n";
        echo "  rollback         Rollback automático\n";
        echo "  maintenance      Mantenimiento programado\n";
        echo "  health           Verificación de salud\n";
        echo "  status           Estado actual del sistema\n";
        echo "  help             Mostrar esta ayuda\n\n";
        
        echo "Opciones de deploy:\n";
        echo "  --no-backup      No crear backup antes de desplegar\n";
        echo "  --no-migrate     No ejecutar migraciones\n";
        echo "  --no-optimize    No optimizar sistema\n";
        echo "  --no-rollback    No hacer rollback automático en error\n\n";
        
        echo "Ejemplos:\n";
        echo "  php deploy.php pre-check\n";
        echo "  php deploy.php backup full\n";
        echo "  php deploy.php deploy\n";
        echo "  php deploy.php deploy --no-backup\n";
        echo "  php deploy.php rollback\n";
        echo "  php deploy.php health\n\n";
        
        echo "Para más información, consulta la documentación.\n";
    }
    
    private function parseDeployOptions(array $args): array {
        $options = [
            'backup_before' => true,
            'update_files' => true,
            'run_migrations' => true,
            'optimize' => true,
            'auto_rollback' => true
        ];
        
        foreach ($args as $arg) {
            switch ($arg) {
                case '--no-backup':
                    $options['backup_before'] = false;
                    break;
                case '--no-migrate':
                    $options['run_migrations'] = false;
                    break;
                case '--no-optimize':
                    $options['optimize'] = false;
                    break;
                case '--no-rollback':
                    $options['auto_rollback'] = false;
                    break;
            }
        }
        
        return $options;
    }
    
    private function formatBytes(int $bytes): string {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $unitIndex = 0;
        
        while ($bytes >= 1024 && $unitIndex < count($units) - 1) {
            $bytes /= 1024;
            $unitIndex++;
        }
        
        return round($bytes, 2) . ' ' . $units[$unitIndex];
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

// Ejecutar script
$deployScript = new DeployScript();
$deployScript->run($argv);
?>
