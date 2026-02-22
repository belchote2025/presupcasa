<?php
// api.php - Versión de Máxima Estabilidad para Hostinger (Bypass 508 y Consolidación)
error_reporting(0); // Desactivar avisos para evitar romper el JSON
// Cookie de sesión con path del directorio de la app (ej. /presup/) para que funcione en local
if (php_sapi_name() !== 'cli') {
    $basePath = dirname($_SERVER['SCRIPT_NAME'] ?? '');
    if ($basePath === '/' || $basePath === '') $basePath = '/';
    else $basePath .= '/';
    @session_set_cookie_params(0, $basePath);
}
session_start();
$session_user_id = $_SESSION['user_id'] ?? null;
$session_username = $_SESSION['username'] ?? null;
$session_role = $_SESSION['role'] ?? null;
// No cerrar sesión aquí: así en login podemos escribir y al hacer session_write_close() se envía la cookie

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");

if ($_SERVER['REMOTE_ADDR'] == '127.0.0.1' || $_SERVER['REMOTE_ADDR'] == '::1') {
    $host = "localhost"; $user = "root"; $pass = ""; $db = "presunavegatel";
    $port = 3306;
    $socket = null;
} else {
    $host = "localhost"; $user = "u600265163_HAggBlS0j_presupadmin"; $pass = "Belchote1@"; $db = "u600265163_HAggBlS0j_presup";
    $port = 3306;
    $socket = null;
}

try {
    // Construir DSN con puerto explícito para evitar problemas con sockets Unix
    $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8";
    if ($socket && file_exists($socket)) {
        $dsn .= ";unix_socket=$socket";
    }
    
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5,
        PDO::ATTR_PERSISTENT => false, // No usar conexiones persistentes
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
    
    $pdo->exec("SET SESSION query_cache_type = OFF"); // Desactivar caché de consultas para evitar problemas
    // Optimizaciones de rendimiento
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
    $pdo->exec("SET SESSION innodb_lock_wait_timeout = 10");

    // --- Logging ---
    if (!is_dir(__DIR__ . '/logs')) @mkdir(__DIR__ . '/logs', 0755, true);
    function app_log($msg, $level = 'info') {
        $f = __DIR__ . '/logs/app.log';
        $line = date('Y-m-d H:i:s') . " [$level] " . (is_string($msg) ? $msg : json_encode($msg)) . "\n";
        @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
    }

    // --- Validación backend ---
    function validate_required($data, $fields) {
        foreach ($fields as $f) {
            $v = $data[$f] ?? null;
            if ($v === null || (is_string($v) && trim($v) === '')) return ['field' => $f, 'message' => "Campo requerido: $f"];
        }
        return null;
    }
    function validate_email($email) {
        if ($email === null || $email === '') return true;
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    $action = $_REQUEST['action'] ?? '';

    // Multi-empresa: empresa activa (solo si existe tabla companies)
    $current_company_id = null;
    try {
        if ($session_user_id) {
            $current_company_id = $_SESSION['current_company_id'] ?? null;
            if ($current_company_id === null || $current_company_id === '') {
                $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
                if ($chk->rowCount() > 0) {
                    $row = $pdo->query("SELECT current_company_id FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
                    $current_company_id = (isset($row['current_company_id']) && $row['current_company_id'] !== null && $row['current_company_id'] !== '') ? (int)$row['current_company_id'] : 1;
                }
            } else {
                $current_company_id = (int)$current_company_id;
            }
        }
    } catch (Exception $e) { $current_company_id = 1; }
    if ($current_company_id === null || $current_company_id < 1) $current_company_id = 1;

    // Lógica consolidada: Obtenemos todo lo necesario para arrancar en UN SOLO viaje.
    if ($action == 'get_boot_data') {
        // Si hay sesión pero el rol no está en sesión (p. ej. sesión antigua), obtenerlo de la tabla users
        if ($session_user_id && ($session_role === null || $session_role === '')) {
            try {
                $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
                $stmt->execute([$session_user_id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row && isset($row['role'])) {
                    $session_role = $row['role'];
                    $_SESSION['role'] = $session_role;
                }
            } catch (Exception $e) { /* ignorar */ }
        }
        $data = [
            "session" => $session_user_id ? ["username" => $session_username, "role" => $session_role] : null,
            "settings" => null,
            "companies" => [],
            "current_company_id" => $current_company_id
        ];
        if ($session_user_id) {
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->query("SELECT id, name FROM companies ORDER BY name ASC");
                    $data["companies"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $stmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
                    $stmt->execute([$current_company_id]);
                    $data["settings"] = $stmt->fetch(PDO::FETCH_ASSOC);
                }
                if (!$data["settings"]) {
                    $stmt = $pdo->query("SELECT * FROM company_settings WHERE id = 1");
                    $data["settings"] = $stmt->fetch(PDO::FETCH_ASSOC);
                }
                // Plantilla de email (presupuesto/factura) está en company_settings
                try {
                    $row = $pdo->query("SELECT document_email_subject, document_email_body FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
                    if ($row && $data["settings"]) {
                        $data["settings"]["document_email_subject"] = $row["document_email_subject"] ?? null;
                        $data["settings"]["document_email_body"] = $row["document_email_body"] ?? null;
                    }
                } catch (Exception $e) {}
            } catch (Exception $e) {
                $stmt = $pdo->query("SELECT * FROM company_settings WHERE id = 1");
                $data["settings"] = $stmt->fetch(PDO::FETCH_ASSOC);
            }
        }
        echo json_encode($data);
        exit;
    }

    if ($action == 'get_companies') {
        if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); exit; }
        try {
            $stmt = $pdo->query("SELECT id, name FROM companies ORDER BY name ASC");
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        } catch (Exception $e) {
            echo json_encode([]);
        }
        exit;
    }
    if ($action == 'set_current_company') {
        if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); exit; }
        $cid = (int)($_POST['company_id'] ?? $_GET['company_id'] ?? 0);
        if ($cid < 1) { echo json_encode(["status" => "error", "message" => "company_id requerido"]); exit; }
        try {
            $stmt = $pdo->prepare("SELECT id FROM companies WHERE id = ?");
            $stmt->execute([$cid]);
            if (!$stmt->fetch()) { echo json_encode(["status" => "error", "message" => "Empresa no encontrada"]); exit; }
            $_SESSION['current_company_id'] = $cid;
            echo json_encode(["status" => "success", "current_company_id" => $cid]);
        } catch (Exception $e) {
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        exit;
    }
    if ($action == 'create_company') {
        if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); exit; }
        $name = trim($_POST['name'] ?? '');
        if (!$name) { echo json_encode(["status" => "error", "message" => "Nombre de empresa requerido"]); exit; }
        try {
            $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
            if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Multi-empresa no activo. Ejecuta add_multi_company.php"]); exit; }
            $pdo->prepare("INSERT INTO companies (name, cif, email, address, default_tax) VALUES (?, ?, ?, ?, ?)")->execute([$name, trim($_POST['cif'] ?? ''), trim($_POST['email'] ?? ''), trim($_POST['address'] ?? ''), (float)($_POST['default_tax'] ?? 21)]);
            $newId = $pdo->lastInsertId();
            echo json_encode(["status" => "success", "id" => (int)$newId, "name" => $name]);
        } catch (Exception $e) {
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
        exit;
    }

    if ($action == 'login') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$_POST['username'] ?? '']);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($u && ($_POST['password'] ?? '') == $u['password']) {
            $_SESSION['user_id'] = $u['id'];
            $_SESSION['username'] = $u['username'];
            $_SESSION['role'] = $u['role'];
            session_write_close(); // guarda sesión y envía cookie antes del body
            echo json_encode(["status" => "success", "user" => ["username" => $u['username'], "role" => $u['role']]]);
        } else {
            session_write_close();
            echo json_encode(["status" => "error", "message" => "Credenciales incorrectas"]);
        }
        exit;
    }

    if ($action == 'logout') {
        session_destroy();
        echo json_encode(["status" => "success"]);
        exit;
    }

    // Recuperación de contraseña (no requiere sesión)
    if ($action == 'request_password_reset') {
        $username = trim($_POST['username'] ?? '');
        if (!$username) {
            echo json_encode(["status" => "error", "message" => "Indica el usuario"]);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$u) {
                app_log("Password reset requested for unknown user: $username", 'info');
                echo json_encode(["status" => "success", "message" => "Si el usuario existe, recibirás un enlace para restablecer la contraseña."]);
                exit;
            }
            $token = bin2hex(random_bytes(32));
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
            $pdo->prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)")->execute([$u['id'], $token, $expires]);
            $resetLink = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME']) . '/index.html?reset=' . urlencode($token);
            app_log("Password reset token created for user id " . $u['id'], 'info');
            echo json_encode(["status" => "success", "message" => "Si el usuario existe, recibirás un enlace.", "reset_token" => $token, "reset_link" => $resetLink]);
        } catch (Exception $ex) {
            app_log("request_password_reset: " . $ex->getMessage(), 'error');
            echo json_encode(["status" => "error", "message" => "Recuperación de contraseña no disponible. Ejecuta create_password_reset.sql en la base de datos."]);
        }
        exit;
    }
    if ($action == 'reset_password') {
        $token = trim($_POST['token'] ?? '');
        $new_password = $_POST['new_password'] ?? '';
        if (!$token || strlen($new_password) < 4) {
            echo json_encode(["status" => "error", "message" => "Token inválido o contraseña demasiado corta (mín. 4 caracteres)."]);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id, user_id FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()");
            $stmt->execute([$token]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                echo json_encode(["status" => "error", "message" => "Enlace caducado o inválido. Solicita uno nuevo."]);
                exit;
            }
            $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")->execute([$new_password, $row['user_id']]);
            $pdo->prepare("DELETE FROM password_reset_tokens WHERE token = ?")->execute([$token]);
            app_log("Password reset completed for user id " . $row['user_id'], 'info');
            echo json_encode(["status" => "success", "message" => "Contraseña actualizada. Ya puedes iniciar sesión."]);
        } catch (Exception $ex) {
            app_log("reset_password: " . $ex->getMessage(), 'error');
            echo json_encode(["status" => "error", "message" => "Error al restablecer. Comprueba que la tabla password_reset_tokens existe (create_password_reset.sql)."]);
        }
        exit;
    }

    // --- Enlace público para que el CLIENTE firme y acepte el presupuesto (sin login) ---
    if ($action == 'get_quote_public') {
        $quote_id = trim($_GET['id'] ?? $_POST['id'] ?? '');
        $token = trim($_GET['token'] ?? $_POST['token'] ?? '');
        if (!$quote_id || !$token) {
            echo json_encode(["error" => "Enlace inválido. Faltan datos."]);
            exit;
        }
        try {
            $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'accept_token'");
            if ($chk->rowCount() === 0) {
                $pdo->exec("ALTER TABLE quotes ADD COLUMN accept_token VARCHAR(64) NULL DEFAULT NULL");
            }
            $stmt = $pdo->prepare("SELECT id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, subtotal, tax_amount, total_amount FROM quotes WHERE id = ? AND accept_token = ? AND (accept_token IS NOT NULL AND accept_token != '') LIMIT 1");
            $stmt->execute([$quote_id, $token]);
            $q = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$q) {
                echo json_encode(["error" => "Presupuesto no encontrado o enlace no válido."]);
                exit;
            }
            if (($q['status'] ?? '') === 'accepted') {
                echo json_encode(["error" => "already_accepted", "message" => "Este presupuesto ya fue aceptado."]);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, quote_id, description, image_url, quantity, price, tax_percent FROM quote_items WHERE quote_id = ? ORDER BY id ASC");
            $stmt->execute([$quote_id]);
            $q['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $q['client_name'] = $q['client_name'] ?? '';
            $q['client_id'] = $q['client_id'] ?? '';
            $q['client_address'] = $q['client_address'] ?? '';
            $q['client_email'] = $q['client_email'] ?? '';
            $q['notes'] = $q['notes'] ?? '';
            echo json_encode($q);
        } catch (Exception $e) {
            echo json_encode(["error" => "Error al cargar el presupuesto."]);
        }
        exit;
    }
    if ($action == 'accept_quote_signature') {
        $quote_id = trim($_POST['id'] ?? '');
        $token = trim($_POST['token'] ?? '');
        $signature = trim($_POST['quote_signature'] ?? '');
        $accepted_by = trim($_POST['accepted_by'] ?? '');
        if (!$quote_id || !$token) {
            echo json_encode(["status" => "error", "message" => "Enlace inválido."]);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id, status FROM quotes WHERE id = ? AND accept_token = ? LIMIT 1");
            $stmt->execute([$quote_id, $token]);
            $q = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$q) {
                echo json_encode(["status" => "error", "message" => "Presupuesto no encontrado o enlace no válido."]);
                exit;
            }
            if (($q['status'] ?? '') === 'accepted') {
                echo json_encode(["status" => "success", "message" => "Este presupuesto ya estaba aceptado."]);
                exit;
            }
            $sigToStore = $signature;
            if ($accepted_by !== '' && $signature === '') {
                $sigToStore = 'Aceptado por: ' . $accepted_by;
            }
            if ($sigToStore === '') {
                echo json_encode(["status" => "error", "message" => "Firma o nombre requerido para aceptar."]);
                exit;
            }
            $stmt = $pdo->prepare("UPDATE quotes SET status = 'accepted', quote_signature = ? WHERE id = ? AND accept_token = ?");
            $stmt->execute([$sigToStore, $quote_id, $token]);
            echo json_encode(["status" => "success", "message" => "Presupuesto aceptado correctamente."]);
        } catch (Exception $e) {
            echo json_encode(["status" => "error", "message" => "Error al guardar la aceptación."]);
        }
        exit;
    }

    if (!$session_user_id) {
        echo json_encode(["status" => "error", "message" => "No autorizado"]); exit;
    }

    $user_id = $session_user_id;

    switch ($action) {
        case 'get_catalog':
            $stmt = $pdo->prepare("SELECT id, description, long_description, image_url, price, tax FROM catalog ORDER BY description ASC LIMIT 200");
            $stmt->execute();
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'get_customers':
            $extraCols = '';
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'notes'");
                if ($chk->rowCount() > 0) $extraCols = ', notes, category, lead_source, birthday';
            } catch (Exception $e) { }
            if ($session_role === 'admin') {
                $category = trim($_GET['category'] ?? '');
                $sql = "SELECT id, name, tax_id, address, email, phone, user_id" . $extraCols . " FROM customers";
                $params = [];
                if ($category !== '') {
                    $sql .= " WHERE (category = ? OR (? = '' AND (category IS NULL OR category = '')))";
                    $params[] = $category;
                    $params[] = $category;
                }
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'company_id'");
                    if ($chk->rowCount() > 0) {
                        $sql .= ($category !== '' ? " AND " : " WHERE ") . " (company_id = ? OR company_id IS NULL)";
                        $params[] = $current_company_id;
                    }
                } catch (Exception $e) { }
                $sql .= " ORDER BY name ASC LIMIT 100";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Solo cargar usernames si hay menos de 20 usuarios únicos
                if (!empty($customers)) {
                    $userIds = array_filter(array_unique(array_column($customers, 'user_id')), function($id) { return $id !== null && $id !== ''; });
                    if (!empty($userIds) && count($userIds) <= 20) {
                        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                        $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
                        $stmt->execute(array_values($userIds));
                        $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                        
                        foreach ($customers as &$c) {
                            $c['username'] = ($c['user_id'] && isset($users[$c['user_id']])) ? $users[$c['user_id']] : null;
                        }
                        unset($c);
                    } else {
                        foreach ($customers as &$c) {
                            $c['username'] = null;
                        }
                        unset($c);
                    }
                }
                echo json_encode($customers);
            } else {
                $category = trim($_GET['category'] ?? '');
                $sql = "SELECT id, name, tax_id, address, email, phone, user_id" . $extraCols . " FROM customers WHERE (user_id = ? OR user_id IS NULL)";
                $params = [$user_id];
                if ($category !== '') {
                    $sql .= " AND (category = ? OR (? = '' AND (category IS NULL OR category = '')))";
                    $params[] = $category;
                    $params[] = $category;
                }
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'company_id'");
                    if ($chk->rowCount() > 0) {
                        $sql .= " AND (company_id = ? OR company_id IS NULL)";
                        $params[] = $current_company_id;
                    }
                } catch (Exception $e) { }
                $sql .= " ORDER BY name ASC LIMIT 100";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($customers as &$c) {
                    $c['username'] = null; // No necesario para usuario normal
                }
                unset($c);
                echo json_encode($customers);
            }
            break;
        case 'get_customers_birthdays':
            $extraCols = '';
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'birthday'");
                if ($chk->rowCount() > 0) $extraCols = ', birthday';
            } catch (Exception $e) { }
            if ($extraCols === '') { echo json_encode([]); break; }
            $companyFilter = '';
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'company_id'");
                if ($chk->rowCount() > 0) $companyFilter = " AND (company_id = ? OR company_id IS NULL)";
            } catch (Exception $e) { }
            if ($session_role === 'admin') {
                $sql = "SELECT id, name, birthday, user_id FROM customers WHERE birthday IS NOT NULL AND MONTH(birthday) = MONTH(CURDATE())" . $companyFilter . " ORDER BY DAY(birthday) ASC LIMIT 50";
                $stmt = $pdo->prepare($sql);
                if ($companyFilter) $stmt->execute([$current_company_id]); else $stmt->execute();
            } else {
                $stmt = $pdo->prepare("SELECT id, name, birthday FROM customers WHERE (user_id = ? OR user_id IS NULL) AND birthday IS NOT NULL AND MONTH(birthday) = MONTH(CURDATE()) AND DAY(birthday) >= DAY(CURDATE())" . $companyFilter . " ORDER BY DAY(birthday) ASC LIMIT 50");
                if ($companyFilter) $stmt->execute([$user_id, $current_company_id]); else $stmt->execute([$user_id]);
            }
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'get_customer_documents':
            $cid = (int)($_GET['customer_id'] ?? 0);
            if ($cid < 1) { echo json_encode(["quotes" => [], "invoices" => []]); break; }
            try {
                $stmt = $pdo->prepare("SELECT id, name FROM customers WHERE id = ?");
                $stmt->execute([$cid]);
                $cust = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$cust) { echo json_encode(["quotes" => [], "invoices" => []]); break; }
                $name = $cust['name'];
                $quotes = [];
                $invoices = [];
                if ($session_role === 'admin') {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM quotes WHERE (client_id = ? OR TRIM(COALESCE(client_name,'')) = TRIM(?)) ORDER BY date DESC LIMIT 50");
                    $stmt->execute([$cid, $name]);
                    $quotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM invoices WHERE (client_id = ? OR TRIM(COALESCE(client_name,'')) = TRIM(?)) ORDER BY date DESC LIMIT 50");
                    $stmt->execute([$cid, $name]);
                    $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } else {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM quotes WHERE user_id = ? AND (client_id = ? OR TRIM(COALESCE(client_name,'')) = TRIM(?)) ORDER BY date DESC LIMIT 50");
                    $stmt->execute([$user_id, $cid, $name]);
                    $quotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM invoices WHERE user_id = ? AND (client_id = ? OR TRIM(COALESCE(client_name,'')) = TRIM(?)) ORDER BY date DESC LIMIT 50");
                    $stmt->execute([$user_id, $cid, $name]);
                    $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                echo json_encode(["quotes" => $quotes, "invoices" => $invoices]);
            } catch (Exception $e) {
                app_log("get_customer_documents: " . $e->getMessage(), 'error');
                echo json_encode(["quotes" => [], "invoices" => []]);
            }
            break;
        case 'get_audit_log':
            $table = preg_replace('/[^a-z_]/', '', $_GET['table_name'] ?? '');
            $recordId = $_GET['record_id'] ?? '';
            if (!$table || !$recordId) { echo json_encode(["status" => "error", "message" => "table_name y record_id requeridos"]); break; }
            $allowed = ['quotes', 'invoices', 'customers'];
            if (!in_array($table, $allowed)) { echo json_encode(["status" => "error", "message" => "Tabla no permitida"]); break; }
            $stmt = $pdo->prepare("SELECT action, username, changes, created_at FROM audit_log WHERE table_name = ? AND record_id = ? ORDER BY created_at DESC LIMIT 50");
            $stmt->execute([$table, $recordId]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'get_appointments':
            if ($session_role === 'admin') {
                // Admin: sin JOIN para mejor rendimiento
                $stmt = $pdo->prepare("SELECT id, user_id, client_name, phone, date, description FROM appointments ORDER BY date ASC LIMIT 200");
                $stmt->execute();
                $appointments = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // Obtener usernames solo si hay citas y menos de 20 usuarios
                if (!empty($appointments)) {
                    $userIds = array_filter(array_unique(array_column($appointments, 'user_id')), function($id) { return $id !== null && $id !== ''; });
                    if (!empty($userIds) && count($userIds) <= 20) {
                        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                        $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
                        $stmt->execute(array_values($userIds));
                        $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                        
                        foreach ($appointments as &$a) {
                            $a['username'] = (isset($a['user_id']) && $a['user_id'] && isset($users[$a['user_id']])) ? $users[$a['user_id']] : null;
                        }
                        unset($a);
                    } else {
                        foreach ($appointments as &$a) {
                            $a['username'] = null;
                        }
                        unset($a);
                    }
                }
                echo json_encode($appointments);
            } else {
                // Usuario normal solo ve sus propias citas
                $stmt = $pdo->prepare("SELECT id, user_id, client_name, phone, date, description FROM appointments WHERE user_id = ? ORDER BY date ASC LIMIT 100");
                $stmt->execute([$user_id]);
                $appointments = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($appointments as &$a) {
                    $a['username'] = null; // No necesario
                }
                unset($a);
                echo json_encode($appointments);
            }
            break;
        case 'get_projects':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) { echo json_encode([]); break; }
                $status = trim($_GET['status'] ?? '');
                $search = trim($_GET['search'] ?? '');
                $where = [];
                $params = [];
                if ($session_role !== 'admin') {
                    $where[] = "p.user_id = ?";
                    $params[] = $user_id;
                }
                if ($status !== '' && in_array($status, ['planning','in_progress','on_hold','completed','cancelled'])) {
                    $where[] = "p.status = ?";
                    $params[] = $status;
                }
                if ($search !== '') {
                    $where[] = "(p.name LIKE ? OR p.client_name LIKE ? OR p.description LIKE ?)";
                    $params[] = "%$search%";
                    $params[] = "%$search%";
                    $params[] = "%$search%";
                }
                $whereSql = $where ? "WHERE " . implode(" AND ", $where) : "";
                $hasTasksTable = $pdo->query("SHOW TABLES LIKE 'project_tasks'")->rowCount() > 0;
                if ($hasTasksTable) {
                    $stmt = $pdo->prepare("SELECT p.id, p.name, p.description, p.client_name, p.client_id, p.status, p.start_date, p.end_date, p.budget, p.user_id, p.created_at, p.updated_at,
                        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id) AS task_count,
                        (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id AND pt.completed = 1) AS tasks_completed
                        FROM projects p $whereSql ORDER BY p.updated_at DESC, p.id DESC LIMIT 200");
                } else {
                    $stmt = $pdo->prepare("SELECT p.id, p.name, p.description, p.client_name, p.client_id, p.status, p.start_date, p.end_date, p.budget, p.user_id, p.created_at, p.updated_at FROM projects p $whereSql ORDER BY p.updated_at DESC, p.id DESC LIMIT 200");
                }
                $stmt->execute($params);
                $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($projects as &$pr) {
                    $pr['task_count'] = (int)($pr['task_count'] ?? 0);
                    $pr['tasks_completed'] = (int)($pr['tasks_completed'] ?? 0);
                }
                unset($pr);
                if (!empty($projects) && $session_role === 'admin') {
                    $userIds = array_filter(array_unique(array_column($projects, 'user_id')));
                    if (!empty($userIds) && count($userIds) <= 30) {
                        $ph = implode(',', array_fill(0, count($userIds), '?'));
                        $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($ph)");
                        $stmt->execute(array_values($userIds));
                        $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                        foreach ($projects as &$pr) {
                            $pr['username'] = isset($pr['user_id'], $users[$pr['user_id']]) ? $users[$pr['user_id']] : null;
                        }
                        unset($pr);
                    }
                } else {
                    foreach ($projects as &$pr) { $pr['username'] = null; }
                    unset($pr);
                }
                echo json_encode($projects);
            } catch (Exception $e) {
                app_log("get_projects: " . $e->getMessage(), 'error');
                echo json_encode([]);
            }
            break;
        case 'get_project':
            $id = (int)($_GET['id'] ?? 0);
            if ($id < 1) { echo json_encode(["status" => "error", "message" => "ID inválido"]); break; }
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Proyectos no disponibles"]); break; }
                $stmt = $pdo->prepare("SELECT * FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                $project = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$project) { echo json_encode(["status" => "error", "message" => "Proyecto no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$project['user_id'] !== (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "No autorizado"]);
                    break;
                }
                $taskCols = "id, project_id, title, description, due_date, completed, sort_order, created_at";
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                    if ($chk->rowCount() > 0) $taskCols .= ", assigned_to_user_id";
                } catch (Exception $e) { }
                $stmt = $pdo->prepare("SELECT $taskCols FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC");
                $stmt->execute([$id]);
                $project['tasks'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $assigneeIds = array_filter(array_unique(array_column($project['tasks'], 'assigned_to_user_id')), function($x) { return $x !== null && $x !== ''; });
                if (!empty($assigneeIds)) {
                    $ph = implode(',', array_fill(0, count($assigneeIds), '?'));
                    $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($ph)");
                    $stmt->execute(array_values($assigneeIds));
                    $assignees = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                    foreach ($project['tasks'] as &$t) {
                        $t['assigned_to_username'] = isset($t['assigned_to_user_id'], $assignees[$t['assigned_to_user_id']]) ? $assignees[$t['assigned_to_user_id']] : null;
                    }
                    unset($t);
                } else {
                    foreach ($project['tasks'] as &$t) { $t['assigned_to_username'] = null; }
                    unset($t);
                }
                $project['linked_quotes'] = [];
                $project['linked_invoices'] = [];
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'project_id'");
                    if ($chk->rowCount() > 0) {
                        $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM quotes WHERE project_id = ? ORDER BY date DESC");
                        $stmt->execute([$id]);
                        $project['linked_quotes'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    }
                    $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'project_id'");
                    if ($chk->rowCount() > 0) {
                        $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM invoices WHERE project_id = ? ORDER BY date DESC");
                        $stmt->execute([$id]);
                        $project['linked_invoices'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    }
                } catch (Exception $e) { }
                echo json_encode($project);
            } catch (Exception $e) {
                app_log("get_project: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'get_users_for_assignment':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $stmt = $pdo->query("SELECT id, username FROM users ORDER BY username ASC");
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } catch (Exception $e) {
                echo json_encode([]);
            }
            break;
        case 'get_my_tasks':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                if ($chk->rowCount() === 0) { echo json_encode([]); break; }
                $stmt = $pdo->prepare("
                    SELECT t.id AS task_id, t.project_id, t.title, t.description, t.due_date, t.completed, t.created_at, t.sort_order,
                           p.name AS project_name, p.status AS project_status,
                           u.username AS assigned_by_username
                    FROM project_tasks t
                    INNER JOIN projects p ON p.id = t.project_id
                    LEFT JOIN users u ON u.id = p.user_id
                    WHERE t.assigned_to_user_id = ?
                    ORDER BY t.completed ASC, (t.due_date IS NULL), t.due_date ASC, t.created_at DESC
                ");
                $stmt->execute([$user_id]);
                $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($tasks);
            } catch (Exception $e) {
                app_log("get_my_tasks: " . $e->getMessage(), 'error');
                echo json_encode([]);
            }
            break;
        case 'save_project':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $err = validate_required($_POST, ['name']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tabla projects no existe. Ejecuta actualización de esquema."]); break; }
                $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
                $name = trim($_POST['name']);
                $description = trim($_POST['description'] ?? '');
                $client_name = trim($_POST['client_name'] ?? '');
                $client_id = isset($_POST['client_id']) && $_POST['client_id'] !== '' ? (int)$_POST['client_id'] : null;
                $status = trim($_POST['status'] ?? 'planning');
                if (!in_array($status, ['planning','in_progress','on_hold','completed','cancelled'])) $status = 'planning';
                $start_date = trim($_POST['start_date'] ?? '') ?: null;
                $end_date = trim($_POST['end_date'] ?? '') ?: null;
                $budget = isset($_POST['budget']) && $_POST['budget'] !== '' ? (float)$_POST['budget'] : null;
                if ($id > 0) {
                    $stmt = $pdo->prepare("SELECT user_id FROM projects WHERE id = ?");
                    $stmt->execute([$id]);
                    $row = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$row) { echo json_encode(["status" => "error", "message" => "Proyecto no encontrado"]); break; }
                    if ($session_role !== 'admin' && (int)$row['user_id'] !== (int)$user_id) {
                        echo json_encode(["status" => "error", "message" => "No autorizado"]);
                        break;
                    }
                    $stmt = $pdo->prepare("UPDATE projects SET name=?, description=?, client_name=?, client_id=?, status=?, start_date=?, end_date=?, budget=?, updated_at=NOW() WHERE id=?");
                    $stmt->execute([$name, $description, $client_name, $client_id, $status, $start_date, $end_date, $budget, $id]);
                    echo json_encode(["status" => "success", "id" => $id]);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO projects (name, description, client_name, client_id, status, start_date, end_date, budget, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$name, $description, $client_name, $client_id, $status, $start_date, $end_date, $budget, $user_id]);
                    echo json_encode(["status" => "success", "id" => (int)$pdo->lastInsertId()]);
                }
            } catch (Exception $e) {
                app_log("save_project: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'delete_project':
            $id = (int)($_POST['id'] ?? 0);
            if ($id < 1) { echo json_encode(["status" => "error", "message" => "ID inválido"]); break; }
            if (!$session_user_id) {
                echo json_encode(["status" => "error", "message" => "No autorizado."]);
                break;
            }
            try {
                $stmt = $pdo->prepare("SELECT user_id FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    echo json_encode(["status" => "error", "message" => "Proyecto no encontrado."]);
                    break;
                }
                $is_admin = ($session_role === 'admin');
                $is_owner = ((int)$row['user_id'] === (int)$session_user_id);
                if (!$is_admin && !$is_owner) {
                    echo json_encode(["status" => "error", "message" => "Solo puedes eliminar tus propios proyectos o ser administrador."]);
                    break;
                }
                $stmt = $pdo->prepare("DELETE FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                app_log("delete_project: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'duplicate_project':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $id = (int)($_POST['id'] ?? $_GET['id'] ?? 0);
            if ($id < 1) { echo json_encode(["status" => "error", "message" => "ID de proyecto requerido"]); break; }
            try {
                $stmt = $pdo->prepare("SELECT * FROM projects WHERE id = ?");
                $stmt->execute([$id]);
                $proj = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$proj) { echo json_encode(["status" => "error", "message" => "Proyecto no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$proj['user_id'] !== (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "No autorizado"]);
                    break;
                }
                $newName = trim($proj['name'] ?? '') . ' (copia)';
                $stmt = $pdo->prepare("INSERT INTO projects (name, description, client_name, client_id, status, start_date, end_date, budget, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $newName,
                    $proj['description'] ?? '',
                    $proj['client_name'] ?? '',
                    $proj['client_id'] ?? null,
                    $proj['status'] ?? 'planning',
                    $proj['start_date'] ?? null,
                    $proj['end_date'] ?? null,
                    $proj['budget'] ?? null,
                    $user_id
                ]);
                $newId = (int)$pdo->lastInsertId();
                $chk = $pdo->query("SHOW TABLES LIKE 'project_tasks'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("SELECT title, description, due_date, completed, sort_order FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC");
                    $stmt->execute([$id]);
                    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $taskCols = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'")->rowCount() > 0;
                    foreach ($tasks as $t) {
                        if ($taskCols) {
                            $stmt = $pdo->prepare("INSERT INTO project_tasks (project_id, title, description, due_date, completed, sort_order, assigned_to_user_id) VALUES (?, ?, ?, ?, ?, ?, NULL)");
                            $stmt->execute([$newId, $t['title'] ?? '', $t['description'] ?? '', $t['due_date'] ?? null, (int)($t['completed'] ?? 0), (int)($t['sort_order'] ?? 0)]);
                        } else {
                            $stmt = $pdo->prepare("INSERT INTO project_tasks (project_id, title, description, due_date, completed, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
                            $stmt->execute([$newId, $t['title'] ?? '', $t['description'] ?? '', $t['due_date'] ?? null, (int)($t['completed'] ?? 0), (int)($t['sort_order'] ?? 0)]);
                        }
                    }
                }
                echo json_encode(["status" => "success", "id" => $newId]);
            } catch (Exception $e) {
                app_log("duplicate_project: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'get_contracts':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'contracts'");
                if ($chk->rowCount() === 0) { echo json_encode([]); break; }
                $status_filter = trim($_GET['status'] ?? '');
                $search_contract = trim($_GET['search'] ?? '');
                $valid_statuses = ['draft', 'sent', 'signed', 'expired', 'cancelled'];
                $where_c = [];
                $params_c = [];
                if ($session_role !== 'admin') {
                    $where_c[] = "user_id = ?";
                    $params_c[] = $user_id;
                }
                if ($status_filter !== '' && in_array($status_filter, $valid_statuses)) {
                    $where_c[] = "status = ?";
                    $params_c[] = $status_filter;
                }
                if ($search_contract !== '') {
                    $where_c[] = "(client_name LIKE ? OR title LIKE ? OR id LIKE ?)";
                    $params_c[] = "%$search_contract%";
                    $params_c[] = "%$search_contract%";
                    $params_c[] = "%$search_contract%";
                }
                $where_sql_c = $where_c ? "WHERE " . implode(" AND ", $where_c) : "";
                $stmt = $pdo->prepare("SELECT id, date, client_name, title, amount, status, start_date, end_date FROM contracts $where_sql_c ORDER BY date DESC LIMIT 500");
                $stmt->execute($params_c);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } catch (Exception $e) {
                echo json_encode([]);
            }
            break;
        case 'get_contract':
            $cid = $_GET['id'] ?? null;
            if (!$cid) { echo json_encode(["error" => "ID requerido"]); break; }
            if (!$session_user_id) { echo json_encode(["error" => "No autorizado"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'contracts'");
                if ($chk->rowCount() === 0) { echo json_encode(["error" => "Contratos no disponibles"]); break; }
                $stmt = $pdo->prepare("SELECT * FROM contracts WHERE id = ?");
                $stmt->execute([$cid]);
                $c = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$c) { echo json_encode(["error" => "Contrato no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$c['user_id'] !== (int)$user_id) {
                    echo json_encode(["error" => "No autorizado"]);
                    break;
                }
                echo json_encode($c);
            } catch (Exception $e) {
                echo json_encode(["error" => $e->getMessage()]);
            }
            break;
        case 'save_contract':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $err = validate_required($_POST, ['client_name']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'contracts'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Ejecuta Actualizar base de datos en Configuración"]); break; }
                $id = trim($_POST['id'] ?? '');
                if ($id === '') $id = 'CON-' . date('Y') . '-' . time();
                $stmt = $pdo->prepare("SELECT id FROM contracts WHERE id = ?");
                $stmt->execute([$id]);
                $exists = $stmt->fetch();
                $title = trim($_POST['title'] ?? '');
                $terms = trim($_POST['terms'] ?? '');
                $amount = isset($_POST['amount']) && $_POST['amount'] !== '' ? (float)str_replace(',', '.', $_POST['amount']) : null;
                $status = trim($_POST['status'] ?? 'draft');
                if (!in_array($status, ['draft','sent','signed','expired','cancelled'])) $status = 'draft';
                $start_date = trim($_POST['start_date'] ?? '') ?: null;
                $end_date = trim($_POST['end_date'] ?? '') ?: null;
                $project_id = isset($_POST['project_id']) && $_POST['project_id'] !== '' ? (int)$_POST['project_id'] : null;
                $quote_id = trim($_POST['quote_id'] ?? '') ?: null;
                if ($exists) {
                    $stmt = $pdo->prepare("UPDATE contracts SET date=?, client_name=?, client_id=?, client_address=?, client_email=?, client_phone=?, title=?, terms=?, amount=?, status=?, start_date=?, end_date=?, project_id=?, quote_id=? WHERE id=? AND user_id=?");
                    $stmt->execute([
                        $_POST['date'] ?? date('Y-m-d H:i:s'),
                        $_POST['client_name'], trim($_POST['client_id'] ?? ''),
                        trim($_POST['client_address'] ?? ''), trim($_POST['client_email'] ?? ''), trim($_POST['client_phone'] ?? ''),
                        $title, $terms, $amount, $status, $start_date, $end_date, $project_id, $quote_id, $id, $user_id
                    ]);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO contracts (id, date, client_name, client_id, client_address, client_email, client_phone, title, terms, amount, status, start_date, end_date, project_id, quote_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $id, $_POST['date'] ?? date('Y-m-d H:i:s'),
                        $_POST['client_name'], trim($_POST['client_id'] ?? ''),
                        trim($_POST['client_address'] ?? ''), trim($_POST['client_email'] ?? ''), trim($_POST['client_phone'] ?? ''),
                        $title, $terms, $amount, $status, $start_date, $end_date, $project_id, $quote_id, $user_id
                    ]);
                }
                echo json_encode(["status" => "success", "id" => $id]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'delete_contract':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $cid = $_POST['id'] ?? $_GET['id'] ?? null;
            if (!$cid) { echo json_encode(["status" => "error", "message" => "ID requerido"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'contracts'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Contratos no disponibles"]); break; }
                $stmt = $pdo->prepare("SELECT user_id FROM contracts WHERE id = ?");
                $stmt->execute([$cid]);
                $row = $stmt->fetch();
                if (!$row) { echo json_encode(["status" => "error", "message" => "Contrato no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$row['user_id'] !== (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "No autorizado"]);
                    break;
                }
                $pdo->prepare("DELETE FROM contracts WHERE id = ?")->execute([$cid]);
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'save_project_task':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $project_id = (int)($_POST['project_id'] ?? 0);
            $title = trim($_POST['title'] ?? '');
            if ($title === '') { echo json_encode(["status" => "error", "message" => "El título de la tarea es obligatorio"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'project_tasks'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tareas no disponibles"]); break; }
                $stmt = $pdo->prepare("SELECT user_id FROM projects WHERE id = ?");
                $stmt->execute([$project_id]);
                $proj = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$proj) { echo json_encode(["status" => "error", "message" => "Proyecto no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$proj['user_id'] !== (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "No autorizado"]);
                    break;
                }
                $task_id = isset($_POST['task_id']) ? (int)$_POST['task_id'] : 0;
                $description = trim($_POST['description'] ?? '');
                $due_date = trim($_POST['due_date'] ?? '') ?: null;
                $completed = isset($_POST['completed']) ? (int)$_POST['completed'] : 0;
                $sort_order = isset($_POST['sort_order']) ? (int)$_POST['sort_order'] : 0;
                $assigned_to = isset($_POST['assigned_to_user_id']) && $_POST['assigned_to_user_id'] !== '' ? (int)$_POST['assigned_to_user_id'] : null;
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                    $has_assignee = $chk->rowCount() > 0;
                } catch (Exception $e) { $has_assignee = false; }
                if ($task_id > 0) {
                    if ($has_assignee) {
                        $stmt = $pdo->prepare("UPDATE project_tasks SET title=?, description=?, due_date=?, completed=?, sort_order=?, assigned_to_user_id=? WHERE id=? AND project_id=?");
                        $stmt->execute([$title, $description, $due_date, $completed, $sort_order, $assigned_to, $task_id, $project_id]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE project_tasks SET title=?, description=?, due_date=?, completed=?, sort_order=? WHERE id=? AND project_id=?");
                        $stmt->execute([$title, $description, $due_date, $completed, $sort_order, $task_id, $project_id]);
                    }
                    echo json_encode(["status" => "success", "id" => $task_id]);
                } else {
                    if ($has_assignee) {
                        $stmt = $pdo->prepare("INSERT INTO project_tasks (project_id, title, description, due_date, completed, sort_order, assigned_to_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$project_id, $title, $description, $due_date, $completed, $sort_order, $assigned_to]);
                    } else {
                        $stmt = $pdo->prepare("INSERT INTO project_tasks (project_id, title, description, due_date, completed, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$project_id, $title, $description, $due_date, $completed, $sort_order]);
                    }
                    echo json_encode(["status" => "success", "id" => (int)$pdo->lastInsertId()]);
                }
            } catch (Exception $e) {
                app_log("save_project_task: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'create_assigned_activity':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $to_user = trim($_POST['to_user'] ?? '');
            $title = trim($_POST['title'] ?? '');
            $description = trim($_POST['description'] ?? '');
            if ($to_user === '') { echo json_encode(["status" => "error", "message" => "Indica a qué usuario asignar la actividad"]); break; }
            if ($title === '') { echo json_encode(["status" => "error", "message" => "Indica el título o descripción de la actividad"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'project_tasks'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tareas no disponibles"]); break; }
                $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Asignación de tareas no disponible"]); break; }
                $stmt = $pdo->query("SELECT id, username FROM users ORDER BY username ASC");
                $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $target_user_id = null;
                $to_clean = mb_strtolower(trim($to_user));
                $norm = function ($s) {
                    if (class_exists('Normalizer') && method_exists('Normalizer', 'normalize')) {
                        $s = Normalizer::normalize($s, Normalizer::FORM_D);
                        return preg_replace('/\p{M}/u', '', $s);
                    }
                    $map = ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u'];
                    return strtr($s, $map);
                };
                $to_normalized = $norm($to_clean);
                $exact = null;
                $partial = null;
                foreach ($users as $u) {
                    $uid = (int)$u['id'];
                    $uname = trim($u['username'] ?? '');
                    $uname_lower = mb_strtolower($uname);
                    $uname_normalized = $norm($uname_lower);
                    if ((string)$uid === trim($to_user)) { $target_user_id = $uid; break; }
                    if ($uname_lower === $to_clean || $uname_normalized === $to_normalized) { $exact = $uid; break; }
                    if (strlen($to_normalized) >= 2 && mb_strpos($uname_normalized, $to_normalized) !== false) $partial = $uid;
                }
                if ($target_user_id === null) $target_user_id = $exact ?? $partial;
                if (!$target_user_id) {
                    echo json_encode(["status" => "error", "message" => "No se encontró el usuario \"" . $to_user . "\". Usa el nombre de usuario exacto."]);
                    break;
                }
                if ($target_user_id === (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "Para asignarte una tarea a ti mismo usa Proyectos > tu proyecto > Añadir tarea."]);
                    break;
                }
                $stmt = $pdo->prepare("SELECT id FROM projects WHERE user_id = ? AND TRIM(name) = 'Tareas asignadas' LIMIT 1");
                $stmt->execute([$user_id]);
                $proj = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$proj) {
                    $stmt = $pdo->prepare("INSERT INTO projects (name, description, client_name, client_id, status, start_date, end_date, budget, user_id) VALUES ('Tareas asignadas', 'Actividades que asignas a otros usuarios', '', NULL, 'in_progress', NULL, NULL, NULL, ?)");
                    $stmt->execute([$user_id]);
                    $project_id = (int)$pdo->lastInsertId();
                } else {
                    $project_id = (int)$proj['id'];
                }
                $stmt = $pdo->prepare("INSERT INTO project_tasks (project_id, title, description, due_date, completed, sort_order, assigned_to_user_id) VALUES (?, ?, ?, NULL, 0, 0, ?)");
                $stmt->execute([$project_id, $title, $description, $target_user_id]);
                $task_id = (int)$pdo->lastInsertId();
                echo json_encode(["status" => "success", "id" => $task_id, "project_id" => $project_id, "assigned_to_user_id" => $target_user_id]);
            } catch (Exception $e) {
                app_log("create_assigned_activity: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'delete_project_task':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $task_id = (int)($_POST['task_id'] ?? 0);
            $project_id = (int)($_POST['project_id'] ?? 0);
            if ($task_id < 1 || $project_id < 1) { echo json_encode(["status" => "error", "message" => "Datos inválidos"]); break; }
            try {
                $stmt = $pdo->prepare("SELECT p.user_id FROM projects p WHERE p.id = ?");
                $stmt->execute([$project_id]);
                $proj = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$proj) { echo json_encode(["status" => "error", "message" => "Proyecto no encontrado"]); break; }
                if ($session_role !== 'admin' && (int)$proj['user_id'] !== (int)$user_id) {
                    echo json_encode(["status" => "error", "message" => "No autorizado"]);
                    break;
                }
                $stmt = $pdo->prepare("DELETE FROM project_tasks WHERE id = ? AND project_id = ?");
                $stmt->execute([$task_id, $project_id]);
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                app_log("delete_project_task: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'set_task_completed':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $task_id = (int)($_POST['task_id'] ?? 0);
            $project_id = (int)($_POST['project_id'] ?? 0);
            $completed = isset($_POST['completed']) ? (int)$_POST['completed'] : 0;
            if ($task_id < 1 || $project_id < 1) { echo json_encode(["status" => "error", "message" => "task_id y project_id requeridos"]); break; }
            try {
                $stmt = $pdo->prepare("SELECT assigned_to_user_id FROM project_tasks WHERE id = ? AND project_id = ?");
                $stmt->execute([$task_id, $project_id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) { echo json_encode(["status" => "error", "message" => "Tarea no encontrada"]); break; }
                $assigned_to = (int)($row['assigned_to_user_id'] ?? 0);
                if ($assigned_to !== (int)$user_id && $session_role !== 'admin') {
                    $stmt = $pdo->prepare("SELECT user_id FROM projects WHERE id = ?");
                    $stmt->execute([$project_id]);
                    $proj = $stmt->fetch(PDO::FETCH_ASSOC);
                    if (!$proj || (int)$proj['user_id'] !== (int)$user_id) {
                        echo json_encode(["status" => "error", "message" => "No puedes modificar esta tarea"]);
                        break;
                    }
                }
                $pdo->prepare("UPDATE project_tasks SET completed = ? WHERE id = ? AND project_id = ?")->execute([$completed ? 1 : 0, $task_id, $project_id]);
                echo json_encode(["status" => "success", "completed" => $completed]);
            } catch (Exception $e) {
                app_log("set_task_completed: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'get_history':
            try {
                $search = $_GET['search'] ?? '';
                $client_name = trim($_GET['client_name'] ?? '');
                $tag_history = trim($_GET['tag'] ?? '');
                $limit = min(100, max(5, (int)($_GET['limit'] ?? 20)));
                $offset = max(0, (int)($_GET['offset'] ?? 0));
                $has_tags_quotes = false;
                try { $has_tags_quotes = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'tags'")->rowCount() > 0; } catch (Exception $e) {}
                $where = "";
                $params_count = [];
                if ($search) { $where = "WHERE (client_name LIKE ? OR id LIKE ?)"; $params_count = ["%$search%", "%$search%"]; }
                if ($client_name !== '') {
                    $and = $where ? " AND " : " WHERE ";
                    $where .= $and . " TRIM(COALESCE(client_name,'')) = ?";
                    $params_count[] = $client_name;
                }
                if ($tag_history !== '' && $has_tags_quotes) {
                    $and = $where ? " AND " : " WHERE ";
                    $where .= $and . " (tags LIKE ? OR tags = ?)";
                    $params_count[] = "%$tag_history%";
                    $params_count[] = $tag_history;
                }
                $has_valid_until = false;
                try { $has_valid_until = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'valid_until'")->rowCount() > 0; } catch (Exception $e) {}
                if ($session_role === 'admin') {
                    $count_sql = "SELECT COUNT(*) FROM quotes $where";
                    $stmt = $pdo->prepare($count_sql);
                    $stmt->execute($params_count);
                    $total = (int)$stmt->fetchColumn();
                    $fields = "id, date, client_name, status, total_amount, user_id";
                    if ($has_tags_quotes) $fields .= ", tags";
                    if ($has_valid_until) $fields .= ", valid_until";
                    $sql = "SELECT $fields FROM quotes $where ORDER BY date DESC LIMIT $limit OFFSET $offset";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params_count);
                    $quotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    
                    // Asegurar que todos los campos estén presentes
                    foreach ($quotes as &$q) {
                        $q['id'] = $q['id'] ?? '';
                        $q['date'] = $q['date'] ?? '';
                        $q['client_name'] = $q['client_name'] ?? 'Sin nombre';
                        $q['status'] = $q['status'] ?? 'draft';
                        $q['total_amount'] = floatval($q['total_amount'] ?? 0);
                        $q['user_id'] = $q['user_id'] ?? null;
                    }
                    unset($q);
                    
                    // Obtener usernames solo si hay quotes y user_ids válidos (máximo 20 usuarios)
                    if (!empty($quotes)) {
                        $userIds = array_filter(array_unique(array_column($quotes, 'user_id')), function($id) { return $id !== null && $id !== ''; });
                        if (!empty($userIds) && count($userIds) <= 20) {
                            try {
                                $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                                $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
                                $stmt->execute(array_values($userIds));
                                $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                                
                                foreach ($quotes as &$q) {
                                    $q['username'] = (isset($q['user_id']) && $q['user_id'] && isset($users[$q['user_id']])) ? $users[$q['user_id']] : null;
                                }
                                unset($q);
                            } catch (Exception $e) {
                                // Si falla la consulta de usuarios, continuar sin usernames
                                foreach ($quotes as &$q) {
                                    $q['username'] = null;
                                }
                                unset($q);
                            }
                        } else {
                            // Si hay muchos usuarios, no cargar usernames
                            foreach ($quotes as &$q) {
                                $q['username'] = null;
                            }
                            unset($q);
                        }
                    }
                    echo json_encode(['items' => $quotes, 'total' => $total], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                } else {
                    $where_user = "WHERE user_id = ?";
                    $params_count = [$user_id];
                    if ($search) { $where_user .= " AND (client_name LIKE ? OR id LIKE ?)"; $params_count[] = "%$search%"; $params_count[] = "%$search%"; }
                    if ($client_name !== '') { $where_user .= " AND TRIM(COALESCE(client_name,'')) = ?"; $params_count[] = $client_name; }
                    if ($tag_history !== '' && $has_tags_quotes) { $where_user .= " AND (tags LIKE ? OR tags = ?)"; $params_count[] = "%$tag_history%"; $params_count[] = $tag_history; }
                    $stmt = $pdo->prepare("SELECT COUNT(*) FROM quotes $where_user");
                    $stmt->execute($params_count);
                    $total = (int)$stmt->fetchColumn();
                    $fields = "id, date, client_name, status, total_amount, user_id";
                    if ($has_tags_quotes) $fields .= ", tags";
                    if ($has_valid_until) $fields .= ", valid_until";
                    $sql = "SELECT $fields FROM quotes $where_user ORDER BY date DESC LIMIT $limit OFFSET $offset";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params_count);
                    $quotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($quotes as &$q) {
                        $q['id'] = $q['id'] ?? '';
                        $q['date'] = $q['date'] ?? '';
                        $q['client_name'] = $q['client_name'] ?? 'Sin nombre';
                        $q['status'] = $q['status'] ?? 'draft';
                        $q['total_amount'] = floatval($q['total_amount'] ?? 0);
                        $q['user_id'] = $q['user_id'] ?? null;
                        $q['username'] = null;
                    }
                    unset($q);
                    echo json_encode(['items' => $quotes, 'total' => $total], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            } catch (Exception $e) {
                app_log("get_history error: " . $e->getMessage(), 'error');
                echo json_encode(['items' => [], 'total' => 0], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            break;
        case 'get_quote':
            try {
                $quote_id = $_GET['id'] ?? null;
                if (!$quote_id) {
                    echo json_encode(["error" => "ID no proporcionado"], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    exit;
                }
                
                // Admin puede ver cualquier presupuesto, usuario normal solo los suyos
                // Usar índice en id (PRIMARY KEY) y user_id para mejor rendimiento
                if ($session_role === 'admin') {
                    $stmt = $pdo->prepare("SELECT * FROM quotes WHERE id = ? LIMIT 1");
                    $stmt->execute([$quote_id]);
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM quotes WHERE id = ? AND user_id = ? LIMIT 1");
                    $stmt->execute([$quote_id, $user_id]);
                }
                
                $q = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$q) {
                    // Si no se encuentra, devolver objeto con error en lugar de null
                    echo json_encode(["error" => "Presupuesto no encontrado"], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    exit;
                }
                
                // Cargar items del presupuesto usando índice en quote_id
                $stmt = $pdo->prepare("SELECT id, quote_id, description, image_url, quantity, price, tax_percent FROM quote_items WHERE quote_id = ? ORDER BY id ASC");
                $stmt->execute([$quote_id]);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // Asegurar que items sea un array
                $q['items'] = is_array($items) ? $items : [];
                
                // Asegurar que todos los campos estén presentes
                $q['id'] = $q['id'] ?? '';
                $q['client_name'] = $q['client_name'] ?? '';
                $q['client_id'] = $q['client_id'] ?? '';
                $q['client_address'] = $q['client_address'] ?? '';
                $q['client_email'] = $q['client_email'] ?? '';
                $q['client_phone'] = $q['client_phone'] ?? '';
                $q['notes'] = $q['notes'] ?? '';
                $q['status'] = $q['status'] ?? 'draft';
                
                // Cargar historial de cambios si la tabla existe
                try {
                    $stmt = $pdo->prepare("SELECT action, username, changes, created_at FROM audit_log WHERE table_name = 'quotes' AND record_id = ? ORDER BY created_at DESC LIMIT 10");
                    $stmt->execute([$quote_id]);
                    $q['audit_log'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (Exception $e) {
                    $q['audit_log'] = [];
                }
                
                echo json_encode($q, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                exit;
            } catch (Exception $e) {
                // En caso de error, devolver objeto con error
                echo json_encode(["error" => "Error al cargar presupuesto: " . $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                exit;
            }
            break;
        case 'get_accept_quote_link':
            $quote_id = trim($_GET['id'] ?? $_POST['id'] ?? '');
            if (!$quote_id) {
                echo json_encode(["status" => "error", "message" => "ID de presupuesto requerido"]);
                break;
            }
            try {
                $stmt = $pdo->prepare("SELECT id, accept_token FROM quotes WHERE id = ? AND (user_id = ? OR ? = 'admin') LIMIT 1");
                $stmt->execute([$quote_id, $user_id, $session_role ?? '']);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    echo json_encode(["status" => "error", "message" => "Presupuesto no encontrado"]);
                    break;
                }
                $token = $row['accept_token'] ?? null;
                if ($token === null || $token === '') {
                    try {
                        if ($pdo->query("SHOW COLUMNS FROM quotes LIKE 'accept_token'")->rowCount() === 0) {
                            $pdo->exec("ALTER TABLE quotes ADD COLUMN accept_token VARCHAR(64) NULL DEFAULT NULL");
                        }
                    } catch (Exception $e) {}
                    $token = bin2hex(random_bytes(24));
                    $pdo->prepare("UPDATE quotes SET accept_token = ? WHERE id = ?")->execute([$token, $quote_id]);
                }
                $base = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . dirname($_SERVER['SCRIPT_NAME'] ?? '/');
                if (substr($base, -1) !== '/') $base .= '/';
                $url = $base . 'index.html?accept=' . urlencode($quote_id) . '&token=' . urlencode($token);
                echo json_encode(["status" => "success", "url" => $url, "token" => $token]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => "Error al generar el enlace."]);
            }
            break;
        case 'save_quote':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id']) || trim($data['id']) === '') {
                echo json_encode(["status" => "error", "message" => "ID de presupuesto requerido"]);
                break;
            }
            if (!isset($data['client']['name']) || trim($data['client']['name']) === '') {
                echo json_encode(["status" => "error", "message" => "Nombre del cliente requerido"]);
                break;
            }
            if (empty($data['items']) || !is_array($data['items'])) {
                echo json_encode(["status" => "error", "message" => "Añade al menos una línea al presupuesto"]);
                break;
            }
            $pdo->beginTransaction();
            
            // Verificar si es creación o actualización
            $stmt = $pdo->prepare("SELECT id FROM quotes WHERE id = ?");
            $stmt->execute([$data['id']]);
            $exists = $stmt->fetch();
            $action = $exists ? 'update' : 'create';
            
            // Obtener datos anteriores para el log (si es actualización)
            $oldData = null;
            if ($exists) {
                $stmt = $pdo->prepare("SELECT client_name, status, total_amount FROM quotes WHERE id = ?");
                $stmt->execute([$data['id']]);
                $oldData = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            
            $project_id = isset($data['project_id']) && $data['project_id'] !== '' ? (int)$data['project_id'] : null;
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'project_id'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("REPLACE INTO quotes (id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$data['id'], $data['date'], $data['client']['name'], $data['client']['id'], $data['client']['address'], $data['client']['email'], $data['client']['phone'] ?? null, $data['notes'], $data['status'], $user_id, $data['totals']['subtotal'], $data['totals']['tax'], $data['totals']['total'], $project_id]);
                } else {
                    throw new Exception('no project_id column');
                }
            } catch (Exception $e) {
                $stmt = $pdo->prepare("REPLACE INTO quotes (id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$data['id'], $data['date'], $data['client']['name'], $data['client']['id'], $data['client']['address'], $data['client']['email'], $data['client']['phone'] ?? null, $data['notes'], $data['status'], $user_id, $data['totals']['subtotal'], $data['totals']['tax'], $data['totals']['total']]);
            }
            if (!empty($data['quote_signature'])) {
                try {
                    $stmt = $pdo->prepare("UPDATE quotes SET quote_signature = ? WHERE id = ?");
                    $stmt->execute([$data['quote_signature'], $data['id']]);
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'quote_signature') === false) throw $e;
                }
            }
            if (array_key_exists('valid_until', $data)) {
                try {
                    if ($pdo->query("SHOW COLUMNS FROM quotes LIKE 'valid_until'")->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE quotes ADD COLUMN valid_until DATE NULL DEFAULT NULL");
                    }
                    $validUntil = isset($data['valid_until']) && trim($data['valid_until'] ?? '') !== '' ? trim($data['valid_until']) : null;
                    $pdo->prepare("UPDATE quotes SET valid_until = ? WHERE id = ?")->execute([$validUntil, $data['id']]);
                } catch (Exception $e) {}
            }
            $stmt = $pdo->prepare("DELETE FROM quote_items WHERE quote_id = ?");
            $stmt->execute([$data['id']]);
            $stmt = $pdo->prepare("INSERT INTO quote_items (quote_id, description, image_url, quantity, price, tax_percent) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($data['items'] as $item) { $stmt->execute([$data['id'], $item['description'], $item['image_url'] ?? null, $item['quantity'], $item['price'], $item['tax']]); }
            if (isset($data['tags']) && trim($data['tags']) !== '') {
                try {
                    if ($pdo->query("SHOW COLUMNS FROM quotes LIKE 'tags'")->rowCount() > 0) {
                        $pdo->prepare("UPDATE quotes SET tags = ? WHERE id = ?")->execute([trim(substr($data['tags'], 0, 255)), $data['id']]);
                    }
                } catch (Exception $e) {}
            }
            // Registrar en audit_log si la tabla existe
            try {
                $changes = [];
                if ($oldData) {
                    if ($oldData['client_name'] != $data['client']['name']) $changes[] = "Cliente: {$oldData['client_name']} → {$data['client']['name']}";
                    if ($oldData['status'] != $data['status']) $changes[] = "Estado: {$oldData['status']} → {$data['status']}";
                    if (abs($oldData['total_amount'] - $data['totals']['total']) > 0.01) $changes[] = "Total: " . number_format($oldData['total_amount'], 2) . "€ → " . number_format($data['totals']['total'], 2) . "€";
                }
                $changesJson = !empty($changes) ? json_encode($changes, JSON_UNESCAPED_UNICODE) : null;
                $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute(['quotes', $data['id'], $action, $user_id, $session_username, $changesJson]);
            } catch (Exception $e) {
                // Si la tabla audit_log no existe, continuar sin error
            }
            
            $pdo->commit();
            echo json_encode(["status" => "success", "id" => $data['id']]);
            break;
        case 'update_quote_status':
            $id = $_POST['id'] ?? null;
            $status = $_POST['status'] ?? null;
            if (!$id || !$status) {
                echo json_encode(["status" => "error", "message" => "Parámetros incompletos"]);
                break;
            }
            $allowed = ['draft', 'sent', 'accepted', 'rejected'];
            if (!in_array($status, $allowed, true)) {
                echo json_encode(["status" => "error", "message" => "Estado no permitido"]);
                break;
            }
            $signature = trim($_POST['quote_signature'] ?? '');
            try {
                if ($session_role === 'admin') {
                    if ($signature !== '') {
                        try {
                            $stmt = $pdo->prepare("UPDATE quotes SET status = ?, quote_signature = ? WHERE id = ?");
                            $stmt->execute([$status, $signature, $id]);
                        } catch (PDOException $e) {
                            if (strpos($e->getMessage(), 'quote_signature') !== false) {
                                $stmt = $pdo->prepare("UPDATE quotes SET status = ? WHERE id = ?");
                                $stmt->execute([$status, $id]);
                            } else throw $e;
                        }
                    } else {
                        $stmt = $pdo->prepare("UPDATE quotes SET status = ? WHERE id = ?");
                        $stmt->execute([$status, $id]);
                    }
                } else {
                    if ($signature !== '') {
                        try {
                            $stmt = $pdo->prepare("UPDATE quotes SET status = ?, quote_signature = ? WHERE id = ? AND user_id = ?");
                            $stmt->execute([$status, $signature, $id, $user_id]);
                        } catch (PDOException $e) {
                            if (strpos($e->getMessage(), 'quote_signature') !== false) {
                                $stmt = $pdo->prepare("UPDATE quotes SET status = ? WHERE id = ? AND user_id = ?");
                                $stmt->execute([$status, $id, $user_id]);
                            } else throw $e;
                        }
                    } else {
                        $stmt = $pdo->prepare("UPDATE quotes SET status = ? WHERE id = ? AND user_id = ?");
                        $stmt->execute([$status, $id, $user_id]);
                    }
                }
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => "Error al actualizar estado"]);
            }
            break;
        case 'delete_quote':
            $quote_id = $_POST['id'] ?? null;
            if (!$quote_id) { echo json_encode(["status" => "error", "message" => "ID requerido"]); break; }
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede eliminar presupuestos."]);
                break;
            }
            try {
                $stmt = $pdo->prepare("SELECT id, user_id FROM quotes WHERE id = ?");
                $stmt->execute([$quote_id]);
                $q = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($q) {
                    $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'delete', ?, ?, ?)");
                    $stmt->execute(['quotes', $quote_id, $user_id, $session_username, 'Eliminado por admin']);
                }
            } catch (Exception $e) { /* audit_log opcional */ }
            $stmt = $pdo->prepare("DELETE FROM quotes WHERE id = ?");
            $stmt->execute([$quote_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'create_deletion_request':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            if ($session_role === 'admin') {
                echo json_encode(["status" => "error", "message" => "Como administrador puedes eliminar directamente desde el listado."]);
                break;
            }
            $table_name = trim($_POST['table_name'] ?? '');
            $record_id = trim($_POST['record_id'] ?? '');
            if (!in_array($table_name, ['quotes', 'invoices']) || $record_id === '') {
                echo json_encode(["status" => "error", "message" => "Datos inválidos."]);
                break;
            }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'deletion_requests'");
                if ($chk->rowCount() === 0) {
                    echo json_encode(["status" => "error", "message" => "Sistema de solicitudes no disponible. Contacta al administrador."]);
                    break;
                }
                if ($table_name === 'quotes') {
                    $stmt = $pdo->prepare("SELECT id FROM quotes WHERE id = ?");
                } else {
                    $stmt = $pdo->prepare("SELECT id FROM invoices WHERE id = ?");
                }
                $stmt->execute([$record_id]);
                if (!$stmt->fetch()) {
                    echo json_encode(["status" => "error", "message" => "El registro no existe."]);
                    break;
                }
                $stmt = $pdo->prepare("INSERT INTO deletion_requests (table_name, record_id, requested_by_user_id, status) VALUES (?, ?, ?, 'pending')");
                $stmt->execute([$table_name, $record_id, $session_user_id]);
                echo json_encode(["status" => "success", "message" => "Solicitud de eliminación enviada al administrador.", "id" => (int)$pdo->lastInsertId()]);
            } catch (Exception $e) {
                app_log("create_deletion_request: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'get_deletion_requests':
            if ($session_role !== 'admin') {
                echo json_encode([]);
                break;
            }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'deletion_requests'");
                if ($chk->rowCount() === 0) { echo json_encode([]); break; }
                $stmt = $pdo->query("
                    SELECT dr.id, dr.table_name, dr.record_id, dr.requested_by_user_id, dr.requested_at, dr.status,
                           u.username AS requested_by_username
                    FROM deletion_requests dr
                    LEFT JOIN users u ON u.id = dr.requested_by_user_id
                    WHERE dr.status = 'pending'
                    ORDER BY dr.requested_at ASC
                ");
                $list = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($list);
            } catch (Exception $e) {
                app_log("get_deletion_requests: " . $e->getMessage(), 'error');
                echo json_encode([]);
            }
            break;
        case 'process_deletion_request':
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede procesar solicitudes."]);
                break;
            }
            $req_id = (int)($_POST['id'] ?? 0);
            $action = trim($_POST['action'] ?? '');
            if ($req_id < 1 || !in_array($action, ['approve', 'reject'])) {
                echo json_encode(["status" => "error", "message" => "Datos inválidos."]);
                break;
            }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'deletion_requests'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tabla no disponible."]); break; }
                $stmt = $pdo->prepare("SELECT id, table_name, record_id, status FROM deletion_requests WHERE id = ? AND status = 'pending'");
                $stmt->execute([$req_id]);
                $req = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$req) {
                    echo json_encode(["status" => "error", "message" => "Solicitud no encontrada o ya procesada."]);
                    break;
                }
                if ($action === 'approve') {
                    if ($req['table_name'] === 'quotes') {
                        $stmt = $pdo->prepare("DELETE FROM quotes WHERE id = ?");
                    } else {
                        $stmt = $pdo->prepare("DELETE FROM invoices WHERE id = ?");
                    }
                    $stmt->execute([$req['record_id']]);
                    $stmt = $pdo->prepare("UPDATE deletion_requests SET status = 'approved', processed_by_user_id = ?, processed_at = NOW() WHERE id = ?");
                    $stmt->execute([$user_id, $req_id]);
                    echo json_encode(["status" => "success", "message" => "Registro eliminado correctamente."]);
                } else {
                    $stmt = $pdo->prepare("UPDATE deletion_requests SET status = 'rejected', processed_by_user_id = ?, processed_at = NOW() WHERE id = ?");
                    $stmt->execute([$user_id, $req_id]);
                    echo json_encode(["status" => "success", "message" => "Solicitud rechazada."]);
                }
            } catch (Exception $e) {
                app_log("process_deletion_request: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'save_customer':
            $err = validate_required($_POST, ['name']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            if (!validate_email($_POST['email'] ?? '')) { echo json_encode(["status" => "error", "message" => "Email no válido"]); break; }
            $notes = trim($_POST['notes'] ?? '');
            $category = trim($_POST['category'] ?? '');
            $lead_source = trim($_POST['lead_source'] ?? '');
            $birthday = trim($_POST['birthday'] ?? '');
            $birthdayVal = ($birthday !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)) ? $birthday : null;
            if (isset($_POST['id']) && $_POST['id']) {
                try {
                    $stmt = $pdo->prepare("UPDATE customers SET name=?, tax_id=?, address=?, email=?, phone=?, notes=?, category=?, lead_source=?, birthday=? WHERE id=? AND user_id=?");
                    $stmt->execute([$_POST['name'], $_POST['tax_id'] ?? '', $_POST['address'] ?? '', $_POST['email'] ?? '', $_POST['phone'] ?? '', $notes ?: null, $category ?: null, $lead_source ?: null, $birthdayVal, $_POST['id'], $user_id]);
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'Unknown column') !== false) {
                        $stmt = $pdo->prepare("UPDATE customers SET name=?, tax_id=?, address=?, email=?, phone=? WHERE id=? AND user_id=?");
                        $stmt->execute([$_POST['name'], $_POST['tax_id'] ?? '', $_POST['address'] ?? '', $_POST['email'] ?? '', $_POST['phone'] ?? '', $_POST['id'], $user_id]);
                    } else throw $e;
                }
                try {
                    $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'update', ?, ?, ?)");
                    $stmt->execute(['customers', $_POST['id'], $user_id, $session_username, 'Cliente actualizado']);
                } catch (Exception $e) { }
            } else {
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'company_id'");
                    $hasCompanyId = $chk->rowCount() > 0;
                    if ($hasCompanyId) {
                        $stmt = $pdo->prepare("INSERT INTO customers (name, tax_id, address, email, phone, user_id, notes, category, lead_source, birthday, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$_POST['name'], $_POST['tax_id'] ?? '', $_POST['address'] ?? '', $_POST['email'] ?? '', $_POST['phone'] ?? '', $user_id, $notes ?: null, $category ?: null, $lead_source ?: null, $birthdayVal, $current_company_id]);
                    } else {
                        $stmt = $pdo->prepare("INSERT INTO customers (name, tax_id, address, email, phone, user_id, notes, category, lead_source, birthday) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$_POST['name'], $_POST['tax_id'] ?? '', $_POST['address'] ?? '', $_POST['email'] ?? '', $_POST['phone'] ?? '', $user_id, $notes ?: null, $category ?: null, $lead_source ?: null, $birthdayVal]);
                    }
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'Unknown column') !== false) {
                        $stmt = $pdo->prepare("INSERT INTO customers (name, tax_id, address, email, phone, user_id) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->execute([$_POST['name'], $_POST['tax_id'] ?? '', $_POST['address'] ?? '', $_POST['email'] ?? '', $_POST['phone'] ?? '', $user_id]);
                    } else throw $e;
                }
                $newId = $pdo->lastInsertId();
                try {
                    $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'create', ?, ?, ?)");
                    $stmt->execute(['customers', $newId, $user_id, $session_username, 'Cliente creado']);
                } catch (Exception $e) { }
                echo json_encode(["status" => "success", "id" => (int)$newId]);
                break;
            }
            echo json_encode(["status" => "success"]);
            break;
        case 'delete_customer':
            $cid = $_POST['id'] ?? null;
            if (!$cid) { echo json_encode(["status" => "error", "message" => "ID requerido"]); break; }
            try {
                $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'delete', ?, ?, ?)");
                $stmt->execute(['customers', $cid, $user_id, $session_username, 'Cliente eliminado']);
            } catch (Exception $e) { }
            $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ? AND user_id = ?");
            $stmt->execute([$cid, $user_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'upload_item_image':
            if (!$session_user_id) {
                echo json_encode(["status" => "error", "message" => "No autorizado"]);
                break;
            }
            if (!isset($_FILES['image']) || $_FILES['image']['error'] !== 0) {
                $errMsg = "No se envió ninguna imagen o hubo un error";
                if (isset($_FILES['image']['error']) && $_FILES['image']['error'] !== 0) {
                    if ($_FILES['image']['error'] === 1 || $_FILES['image']['error'] === 2) $errMsg = "Archivo demasiado grande. Aumenta upload_max_filesize en PHP.";
                    elseif ($_FILES['image']['error'] === 3) $errMsg = "La imagen se subió solo parcialmente.";
                    elseif ($_FILES['image']['error'] === 4) $errMsg = "No se seleccionó ningún archivo.";
                }
                echo json_encode(["status" => "error", "message" => $errMsg]);
                break;
            }
            $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
                echo json_encode(["status" => "error", "message" => "Formato no permitido. Usa JPG, PNG, GIF o WebP."]);
                break;
            }
            $uploadDir = __DIR__ . DIRECTORY_SEPARATOR . 'uploads';
            if (!is_dir($uploadDir)) @mkdir($uploadDir, 0777, true);
            $basename = 'item_' . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
            $fullPath = $uploadDir . DIRECTORY_SEPARATOR . $basename;
            $urlPath = 'uploads/' . $basename;
            if (move_uploaded_file($_FILES['image']['tmp_name'], $fullPath)) {
                echo json_encode(["status" => "success", "url" => $urlPath]);
            } else {
                echo json_encode(["status" => "error", "message" => "No se pudo guardar la imagen. Comprueba permisos de la carpeta uploads."]);
            }
            break;
        case 'import_customers':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            if (!isset($_FILES['csv']) || $_FILES['csv']['error'] !== 0) {
                echo json_encode(["status" => "error", "message" => "Sube un archivo CSV (columnas: name, tax_id, address, email, phone)"]);
                break;
            }
            $csvPath = $_FILES['csv']['tmp_name'];
            $lines = @file($csvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines || count($lines) < 2) {
                echo json_encode(["status" => "error", "message" => "El CSV debe tener cabecera y al menos una fila"]);
                break;
            }
            $delim = (strpos($lines[0], ';') !== false) ? ';' : ',';
            $headers = str_getcsv(array_shift($lines), $delim);
            $headers = array_map(function($h) { return strtolower(trim(preg_replace('/[\x00-\x1F\x7F]/', '', $h))); }, $headers);
            $col = function($names) use ($headers) { foreach ((array)$names as $n) { $i = array_search($n, $headers); if ($i !== false) return $i; } return null; };
            $idxName = $col(['name','nombre']);
            $idxTaxId = $col(['tax_id','nif','cif']);
            $idxAddr = $col(['address','direccion']);
            $idxEmail = $col(['email']);
            $idxPhone = $col(['phone','telefono']);
            if ($idxName === null) $idxName = 0;
            $imported = 0;
            $errors = [];
            try {
                $stmt = $pdo->prepare("INSERT INTO customers (name, tax_id, address, email, phone, user_id) VALUES (?, ?, ?, ?, ?, ?)");
                foreach ($lines as $num => $line) {
                    $row = str_getcsv($line, $delim);
                    $name = trim($row[$idxName] ?? '');
                    if ($name === '') { $errors[] = "Fila " . ($num+2) . ": falta nombre"; continue; }
                    $stmt->execute([
                        $name,
                        $idxTaxId !== null ? trim($row[$idxTaxId] ?? '') : '',
                        $idxAddr !== null ? trim($row[$idxAddr] ?? '') : '',
                        $idxEmail !== null ? trim($row[$idxEmail] ?? '') : '',
                        $idxPhone !== null ? trim($row[$idxPhone] ?? '') : '',
                        $user_id
                    ]);
                    $imported++;
                }
                echo json_encode(["status" => "success", "imported" => $imported, "errors" => array_slice($errors, 0, 10)]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => $e->getMessage(), "imported" => $imported]);
            }
            break;
        case 'import_projects':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tabla projects no existe"]); break; }
            } catch (Exception $e) { echo json_encode(["status" => "error", "message" => $e->getMessage()]); break; }
            if (!isset($_FILES['csv']) || $_FILES['csv']['error'] !== 0) {
                echo json_encode(["status" => "error", "message" => "Sube un archivo CSV (columnas: name, description, client_name, status, start_date, end_date, budget)"]);
                break;
            }
            $csvPath = $_FILES['csv']['tmp_name'];
            $lines = @file($csvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines || count($lines) < 2) {
                echo json_encode(["status" => "error", "message" => "El CSV debe tener cabecera y al menos una fila"]);
                break;
            }
            $delim = (strpos($lines[0], ';') !== false) ? ';' : ',';
            $headers = str_getcsv(array_shift($lines), $delim);
            $headers = array_map(function($h) { return strtolower(trim(preg_replace('/[\x00-\x1F\x7F]/', '', $h))); }, $headers);
            $col = function($names) use ($headers) { foreach ((array)$names as $n) { $i = array_search($n, $headers); if ($i !== false) return $i; } return null; };
            $idxName = $col(['name','nombre']);
            $idxDesc = $col(['description','descripcion']);
            $idxClient = $col(['client_name','client','cliente']);
            $idxStatus = $col(['status','estado']);
            $idxStart = $col(['start_date','start','fecha_inicio','fecha inicio']);
            $idxEnd = $col(['end_date','end','fecha_fin','fecha fin']);
            $idxBudget = $col(['budget','presupuesto']);
            if ($idxName === null) $idxName = 0;
            $imported = 0;
            $stmt = $pdo->prepare("INSERT INTO projects (name, description, client_name, client_id, status, start_date, end_date, budget, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($lines as $num => $line) {
                $row = str_getcsv($line, $delim);
                $name = trim($row[$idxName] ?? '');
                if ($name === '') continue;
                $status = trim($row[$idxStatus] ?? 'planning');
                if (!in_array($status, ['planning','in_progress','on_hold','completed','cancelled'])) $status = 'planning';
                $start = trim($row[$idxStart] ?? '') ?: null;
                $end = trim($row[$idxEnd] ?? '') ?: null;
                $budget = isset($row[$idxBudget]) && $row[$idxBudget] !== '' ? (float)str_replace(',', '.', $row[$idxBudget]) : null;
                $stmt->execute([
                    $name,
                    trim($row[$idxDesc] ?? ''),
                    trim($row[$idxClient] ?? ''),
                    null,
                    $status,
                    $start,
                    $end,
                    $budget,
                    $user_id
                ]);
                $imported++;
            }
            echo json_encode(["status" => "success", "imported" => $imported]);
            break;
        case 'import_invoices':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            if (!isset($_FILES['csv']) || $_FILES['csv']['error'] !== 0) {
                echo json_encode(["status" => "error", "message" => "Sube un archivo CSV (columnas: id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, subtotal, tax_amount, total_amount)"]);
                break;
            }
            $csvPath = $_FILES['csv']['tmp_name'];
            $lines = @file($csvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines || count($lines) < 2) {
                echo json_encode(["status" => "error", "message" => "El CSV debe tener cabecera y al menos una fila"]);
                break;
            }
            $delim = (strpos($lines[0], ';') !== false) ? ';' : ',';
            $headers = str_getcsv(array_shift($lines), $delim);
            $headers = array_map(function($h) { return strtolower(trim(preg_replace('/[\x00-\x1F\x7F]/', '', $h))); }, $headers);
            $col = function($names) use ($headers) { foreach ((array)$names as $n) { $i = array_search($n, $headers); if ($i !== false) return $i; } return null; };
            $idxId = $col(['id']);
            $idxDate = $col(['date','fecha']);
            $idxClientName = $col(['client_name','client','cliente']);
            $idxClientId = $col(['client_id','nif','cif']);
            $idxAddr = $col(['client_address','address','direccion']);
            $idxEmail = $col(['client_email','email']);
            $idxPhone = $col(['client_phone','phone','telefono']);
            $idxNotes = $col(['notes','notas']);
            $idxStatus = $col(['status','estado']);
            $idxSub = $col(['subtotal']);
            $idxTax = $col(['tax_amount','tax','iva']);
            $idxTotal = $col(['total_amount','total','total']);
            if ($idxClientName === null) $idxClientName = 0;
            if ($idxDate === null) $idxDate = 1;
            if ($idxTotal === null) $idxTotal = count($headers) - 1;
            $imported = 0;
            $pdo->beginTransaction();
            try {
                foreach ($lines as $num => $line) {
                    $row = str_getcsv($line, $delim);
                    $clientName = trim($row[$idxClientName] ?? '');
                    if ($clientName === '') continue;
                    $invId = ($idxId !== null && trim($row[$idxId] ?? '') !== '') ? trim($row[$idxId]) : ('FAC-IMP-' . time() . '-' . $num);
                    $date = trim($row[$idxDate] ?? date('Y-m-d'));
                    $subtotal = $idxSub !== null && isset($row[$idxSub]) && $row[$idxSub] !== '' ? (float)str_replace(',', '.', $row[$idxSub]) : 0;
                    $taxAmt = $idxTax !== null && isset($row[$idxTax]) && $row[$idxTax] !== '' ? (float)str_replace(',', '.', $row[$idxTax]) : 0;
                    $total = $idxTotal !== null && isset($row[$idxTotal]) && $row[$idxTotal] !== '' ? (float)str_replace(',', '.', $row[$idxTotal]) : ($subtotal + $taxAmt);
                    $stmt = $pdo->prepare("INSERT INTO invoices (id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $invId,
                        $date,
                        $clientName,
                        trim($row[$idxClientId] ?? ''),
                        trim($row[$idxAddr] ?? ''),
                        trim($row[$idxEmail] ?? ''),
                        trim($row[$idxPhone] ?? ''),
                        trim($row[$idxNotes] ?? ''),
                        in_array(trim($row[$idxStatus] ?? 'pending'), ['pending','paid','cancelled']) ? trim($row[$idxStatus]) : 'pending',
                        $user_id,
                        $subtotal,
                        $taxAmt,
                        $total
                    ]);
                    $stmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, description, quantity, price, tax_percent) VALUES (?, ?, 1, ?, 0)");
                    $stmt->execute([$invId, 'Importado', $total]);
                    $imported++;
                }
                $pdo->commit();
                echo json_encode(["status" => "success", "imported" => $imported]);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(["status" => "error", "message" => $e->getMessage(), "imported" => $imported]);
            }
            break;
        case 'import_quotes':
            if (!$session_user_id) { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            if (!isset($_FILES['csv']) || $_FILES['csv']['error'] !== 0) {
                echo json_encode(["status" => "error", "message" => "Sube un archivo CSV (columnas: id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, subtotal, tax_amount, total_amount)"]);
                break;
            }
            $csvPath = $_FILES['csv']['tmp_name'];
            $lines = @file($csvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines || count($lines) < 2) {
                echo json_encode(["status" => "error", "message" => "El CSV debe tener cabecera y al menos una fila"]);
                break;
            }
            $delim = (strpos($lines[0], ';') !== false) ? ';' : ',';
            $headers = str_getcsv(array_shift($lines), $delim);
            $headers = array_map(function($h) { return strtolower(trim(preg_replace('/[\x00-\x1F\x7F]/', '', $h))); }, $headers);
            $col = function($names) use ($headers) { foreach ((array)$names as $n) { $i = array_search($n, $headers); if ($i !== false) return $i; } return null; };
            $idxId = $col(['id']); $idxDate = $col(['date','fecha']); $idxClientName = $col(['client_name','client','cliente']); $idxClientId = $col(['client_id','nif','cif']);
            $idxAddr = $col(['client_address','address','direccion']); $idxEmail = $col(['client_email','email']); $idxPhone = $col(['client_phone','phone']);
            $idxNotes = $col(['notes','notas']); $idxStatus = $col(['status','estado']); $idxSub = $col(['subtotal']); $idxTax = $col(['tax_amount','tax','iva']); $idxTotal = $col(['total_amount','total']);
            if ($idxClientName === null) $idxClientName = 0;
            if ($idxDate === null) $idxDate = 1;
            if ($idxTotal === null) $idxTotal = count($headers) - 1;
            $imported = 0;
            $pdo->beginTransaction();
            try {
                foreach ($lines as $num => $line) {
                    $row = str_getcsv($line, $delim);
                    $clientName = trim($row[$idxClientName] ?? '');
                    if ($clientName === '') continue;
                    $quoteId = ($idxId !== null && trim($row[$idxId] ?? '') !== '') ? trim($row[$idxId]) : ('PRE-IMP-' . time() . '-' . $num);
                    $date = trim($row[$idxDate] ?? date('Y-m-d'));
                    $subtotal = $idxSub !== null && isset($row[$idxSub]) && $row[$idxSub] !== '' ? (float)str_replace(',', '.', $row[$idxSub]) : 0;
                    $taxAmt = $idxTax !== null && isset($row[$idxTax]) && $row[$idxTax] !== '' ? (float)str_replace(',', '.', $row[$idxTax]) : 0;
                    $total = $idxTotal !== null && isset($row[$idxTotal]) && $row[$idxTotal] !== '' ? (float)str_replace(',', '.', $row[$idxTotal]) : ($subtotal + $taxAmt);
                    $stmt = $pdo->prepare("INSERT INTO quotes (id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $quoteId, $date, $clientName, trim($row[$idxClientId] ?? ''), trim($row[$idxAddr] ?? ''), trim($row[$idxEmail] ?? ''), trim($row[$idxPhone] ?? ''),
                        trim($row[$idxNotes] ?? ''), in_array(trim($row[$idxStatus] ?? 'draft'), ['draft','sent','accepted','rejected']) ? trim($row[$idxStatus]) : 'draft',
                        $user_id, $subtotal, $taxAmt, $total
                    ]);
                    $stmt = $pdo->prepare("INSERT INTO quote_items (quote_id, description, quantity, price, tax_percent) VALUES (?, ?, 1, ?, 0)");
                    $stmt->execute([$quoteId, 'Importado', $total]);
                    $imported++;
                }
                $pdo->commit();
                echo json_encode(["status" => "success", "imported" => $imported]);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(["status" => "error", "message" => $e->getMessage(), "imported" => $imported]);
            }
            break;
        case 'save_catalog_item':
            $err = validate_required($_POST, ['description', 'price']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            $price = (float)($_POST['price'] ?? 0);
            if ($price < 0) { echo json_encode(["status" => "error", "message" => "El precio no puede ser negativo"]); break; }
            $edit_id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
            $img = null;
            if (isset($_FILES['image']) && $_FILES['image']['error'] === 0) {
                if (!is_dir('uploads')) mkdir('uploads', 0777, true);
                $img = 'uploads/item_'.time().'_'.rand(1000,9999).'.'.pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
                if (move_uploaded_file($_FILES['image']['tmp_name'], $img)) {
                    if (!file_exists($img)) $img = null;
                } else {
                    $img = null;
                }
            }
            if ($edit_id > 0) {
                $row = $pdo->prepare("SELECT image_url FROM catalog WHERE id = ?");
                $row->execute([$edit_id]);
                $existing = $row->fetch(PDO::FETCH_ASSOC);
                $image_url = $img !== null ? $img : ($existing['image_url'] ?? null);
                $stmt = $pdo->prepare("UPDATE catalog SET description = ?, long_description = ?, image_url = ?, price = ?, tax = ? WHERE id = ?");
                $stmt->execute([$_POST['description'], $_POST['long_description'] ?? '', $image_url, $_POST['price'], $_POST['tax'] ?? 21, $edit_id]);
                echo json_encode(["status" => "success", "id" => $edit_id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO catalog (description, long_description, image_url, price, tax) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$_POST['description'], $_POST['long_description'] ?? '', $img, $_POST['price'], $_POST['tax'] ?? 21]);
                echo json_encode(["status" => "success", "id" => $pdo->lastInsertId()]);
            }
            break;
        case 'cleanup_broken_images':
            // Limpiar referencias a imágenes que no existen
            if ($session_role === 'admin') {
                $stmt = $pdo->query("SELECT id, image_url FROM catalog WHERE image_url IS NOT NULL");
                $broken = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    if (!file_exists($row['image_url'])) {
                        $broken[] = $row['id'];
                    }
                }
                if (!empty($broken)) {
                    $placeholders = implode(',', array_fill(0, count($broken), '?'));
                    $pdo->prepare("UPDATE catalog SET image_url = NULL WHERE id IN ($placeholders)")->execute($broken);
                }
                echo json_encode(["status" => "success", "cleaned" => count($broken)]);
            }
            break;
        case 'get_invoices':
            $limit_inv = min(100, max(5, (int)($_GET['limit'] ?? 20)));
            $offset_inv = max(0, (int)($_GET['offset'] ?? 0));
            $client_name_inv = trim($_GET['client_name'] ?? '');
            $tag_inv = trim($_GET['tag'] ?? '');

            // Detectar columnas reales de la tabla para no romper en esquemas antiguos
            $cols = [];
            try {
                $stmtCols = $pdo->query("SHOW COLUMNS FROM invoices");
                foreach ($stmtCols->fetchAll(PDO::FETCH_ASSOC) as $c) {
                    if (!empty($c['Field'])) $cols[$c['Field']] = true;
                }
            } catch (Exception $e) {
                // Si falla algo muy raro, devolvemos lista vacía en vez de reventar
                echo json_encode(['items' => [], 'total' => 0]);
                break;
            }

            $has_col = function($name) use ($cols) { return isset($cols[$name]); };

            $wanted_base = ['id', 'date', 'client_name', 'status', 'user_id', 'total_amount'];
            $wanted_opt  = ['is_recurring', 'recurrence_frequency', 'next_date'];
            $fields_arr  = [];
            foreach ($wanted_base as $c) {
                if ($has_col($c)) $fields_arr[] = $c;
            }
            foreach ($wanted_opt as $c) {
                if ($has_col($c)) $fields_arr[] = $c;
            }
            $has_tags_col = $has_col('tags');
            if ($has_tags_col) $fields_arr[] = 'tags';

            // Si por algún motivo no tenemos ni id ni client_name, algo grave pasa: devolvemos vacío
            if (empty($fields_arr)) {
                echo json_encode(['items' => [], 'total' => 0]);
                break;
            }

            $fields_inv = implode(', ', $fields_arr);

            $where_inv = '';
            $params_inv = [];

            // Filtro por cliente (solo si la columna existe)
            if ($client_name_inv !== '' && $has_col('client_name')) {
                $where_inv .= ($where_inv === '' ? ' WHERE ' : ' AND ') . "TRIM(COALESCE(client_name,'')) = ?";
                $params_inv[] = $client_name_inv;
            }

            // Filtro por etiqueta (solo si existe columna tags)
            if ($tag_inv !== '' && $has_tags_col) {
                $where_inv .= ($where_inv === '' ? ' WHERE ' : ' AND ') . "(tags LIKE ? OR tags = ?)";
                $params_inv[] = "%$tag_inv%";
                $params_inv[] = $tag_inv;
            }

            $has_user_id_col = $has_col('user_id');

            if ($session_role === 'admin' || !$has_user_id_col) {
                // Admin ve todas las facturas; si no hay columna user_id, todos ven todo
                $sqlCount = "SELECT COUNT(*) FROM invoices" . $where_inv;
                $stmt = $pdo->prepare($sqlCount);
                $stmt->execute($params_inv);
                $total_inv = (int)$stmt->fetchColumn();
                $sqlList = "SELECT $fields_inv FROM invoices" . $where_inv . " ORDER BY " . ($has_col('date') ? 'date' : 'id') . " DESC LIMIT " . (int)$limit_inv . " OFFSET " . (int)$offset_inv;
                $stmt = $pdo->prepare($sqlList);
                $stmt->execute($params_inv);
                $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                // Usuario normal: solo sus facturas y las que tengan user_id NULL (legacy)
                $where_inv_user = "WHERE (user_id = ? OR user_id IS NULL)";
                $params_user = [$user_id];
                if ($client_name_inv !== '' && $has_col('client_name')) {
                    $where_inv_user .= " AND TRIM(COALESCE(client_name,'')) = ?";
                    $params_user[] = $client_name_inv;
                }
                if ($tag_inv !== '' && $has_tags_col) {
                    $where_inv_user .= " AND (tags LIKE ? OR tags = ?)";
                    $params_user[] = "%$tag_inv%";
                    $params_user[] = $tag_inv;
                }
                $sqlCount = "SELECT COUNT(*) FROM invoices " . $where_inv_user;
                $stmt = $pdo->prepare($sqlCount);
                $stmt->execute($params_user);
                $total_inv = (int)$stmt->fetchColumn();
                $sqlList = "SELECT $fields_inv FROM invoices " . $where_inv_user . " ORDER BY " . ($has_col('date') ? 'date' : 'id') . " DESC LIMIT " . (int)$limit_inv . " OFFSET " . (int)$offset_inv;
                $stmt = $pdo->prepare($sqlList);
                $stmt->execute($params_user);
                $invoices = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // Resolver nombre de usuario si tenemos user_id y es admin
            if (!empty($invoices) && $has_user_id_col && $session_role === 'admin') {
                $userIds = array_filter(array_unique(array_column($invoices, 'user_id')), function($id) { return $id !== null && $id !== ''; });
                if (!empty($userIds) && count($userIds) <= 20) {
                    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                    $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
                    $stmt->execute(array_values($userIds));
                    $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                    foreach ($invoices as &$i) {
                        $i['username'] = (isset($i['user_id']) && $i['user_id'] && isset($users[$i['user_id']])) ? $users[$i['user_id']] : null;
                    }
                    unset($i);
                } else {
                    foreach ($invoices as &$i) { $i['username'] = null; }
                    unset($i);
                }
            } else {
                foreach ($invoices as &$i) { $i['username'] = null; }
                unset($i);
            }

            echo json_encode(['items' => $invoices, 'total' => $total_inv]);
            break;
        case 'upgrade_database':
            // Actualizar toda la base de datos en producción (solo admin): ejecuta todos los esquemas en uno
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede actualizar la base de datos."]);
                break;
            }
            $allChanges = [];
            $hasError = false;
            $errorMessage = '';
            try {
                // 1. Facturas recurrentes
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'is_recurring'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN is_recurring TINYINT(1) DEFAULT 0");
                    $allChanges[] = "invoices.is_recurring";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'recurrence_frequency'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN recurrence_frequency VARCHAR(20) NULL");
                    $allChanges[] = "invoices.recurrence_frequency";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'next_date'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN next_date DATE NULL");
                    $allChanges[] = "invoices.next_date";
                }
                // 2. Proyectos
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE projects (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, description TEXT, client_name VARCHAR(255), client_id INT NULL, status ENUM('planning','in_progress','on_hold','completed','cancelled') DEFAULT 'planning', start_date DATE NULL, end_date DATE NULL, budget DECIMAL(12,2) NULL, user_id INT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL)");
                    $allChanges[] = "Tabla projects";
                }
                $chk = $pdo->query("SHOW TABLES LIKE 'project_tasks'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE project_tasks (id INT PRIMARY KEY AUTO_INCREMENT, project_id INT NOT NULL, title VARCHAR(255) NOT NULL, description TEXT, due_date DATE NULL, completed TINYINT(1) DEFAULT 0, sort_order INT DEFAULT 0, assigned_to_user_id INT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL)");
                    $allChanges[] = "Tabla project_tasks";
                } else {
                    $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE project_tasks ADD COLUMN assigned_to_user_id INT NULL AFTER sort_order");
                        $allChanges[] = "project_tasks.assigned_to_user_id";
                    }
                }
                // 3. Solicitudes de eliminación
                $chk = $pdo->query("SHOW TABLES LIKE 'deletion_requests'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE deletion_requests (id INT PRIMARY KEY AUTO_INCREMENT, table_name ENUM('quotes','invoices') NOT NULL, record_id VARCHAR(50) NOT NULL, requested_by_user_id INT NOT NULL, requested_at DATETIME DEFAULT CURRENT_TIMESTAMP, status ENUM('pending','approved','rejected') DEFAULT 'pending', processed_by_user_id INT NULL, processed_at DATETIME NULL, FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE)");
                    $allChanges[] = "Tabla deletion_requests";
                }
                // 4. Vincular presupuestos/facturas a proyectos (solo si existe tabla projects)
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() > 0) {
                    $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'project_id'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE quotes ADD COLUMN project_id INT NULL");
                        $allChanges[] = "quotes.project_id";
                    }
                    $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'project_id'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE invoices ADD COLUMN project_id INT NULL");
                        $allChanges[] = "invoices.project_id";
                    }
                }
                // 4b. Validez del presupuesto (opcional)
                $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'valid_until'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE quotes ADD COLUMN valid_until DATE NULL DEFAULT NULL");
                    $allChanges[] = "quotes.valid_until";
                }
                // 5. Numeración de facturas (prefijo + siguiente número) en company_settings
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'invoice_prefix'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE company_settings ADD COLUMN invoice_prefix VARCHAR(20) DEFAULT 'FAC'");
                    $allChanges[] = "company_settings.invoice_prefix";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'invoice_next_number'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE company_settings ADD COLUMN invoice_next_number INT DEFAULT 1");
                    $allChanges[] = "company_settings.invoice_next_number";
                }
                // 6. Contratos
                $chk = $pdo->query("SHOW TABLES LIKE 'contracts'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE contracts (
                        id VARCHAR(50) PRIMARY KEY,
                        date DATETIME DEFAULT CURRENT_TIMESTAMP,
                        client_name VARCHAR(255),
                        client_id VARCHAR(50),
                        client_address TEXT,
                        client_email VARCHAR(255),
                        client_phone VARCHAR(20),
                        title VARCHAR(255),
                        terms TEXT,
                        amount DECIMAL(12,2),
                        status ENUM('draft','sent','signed','expired','cancelled') DEFAULT 'draft',
                        start_date DATE NULL,
                        end_date DATE NULL,
                        project_id INT NULL,
                        quote_id VARCHAR(50) NULL,
                        user_id INT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )");
                    $allChanges[] = "Tabla contracts";
                }
                // 7. Mensajes de administrador a usuarios
                $chk = $pdo->query("SHOW TABLES LIKE 'user_messages'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE user_messages (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        from_user_id INT NOT NULL,
                        to_user_id INT NOT NULL,
                        subject VARCHAR(255) DEFAULT NULL,
                        body TEXT DEFAULT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        read_at DATETIME NULL,
                        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
                    )");
                    $allChanges[] = "Tabla user_messages";
                }
                echo json_encode([
                    "status" => "success",
                    "message" => count($allChanges) ? "Base de datos actualizada correctamente." : "La base de datos ya estaba al día.",
                    "changes" => $allChanges
                ]);
            } catch (Exception $e) {
                app_log("upgrade_database error: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => "Error al actualizar: " . $e->getMessage(), "changes" => $allChanges]);
            }
            break;
        case 'upgrade_recurring_schema':
            // Script de actualización ejecutable desde el navegador (solo admin)
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede actualizar el esquema."]);
                break;
            }
            $changes = [];
            try {
                // Comprobar y añadir columnas de facturas recurrentes
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'is_recurring'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN is_recurring TINYINT(1) DEFAULT 0");
                    $changes[] = "Añadida columna invoices.is_recurring";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'recurrence_frequency'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN recurrence_frequency VARCHAR(20) NULL");
                    $changes[] = "Añadida columna invoices.recurrence_frequency";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'next_date'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN next_date DATE NULL");
                    $changes[] = "Añadida columna invoices.next_date";
                }
                echo json_encode([
                    "status" => "success",
                    "message" => $changes ? "Esquema actualizado correctamente." : "No había cambios que aplicar.",
                    "changes" => $changes
                ]);
            } catch (Exception $e) {
                app_log("upgrade_recurring_schema error: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => "Error al actualizar el esquema: " . $e->getMessage()]);
            }
            break;
        case 'upgrade_tags_schema':
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede actualizar el esquema."]);
                break;
            }
            $changes = [];
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM quotes LIKE 'tags'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE quotes ADD COLUMN tags VARCHAR(255) NULL");
                    $changes[] = "Añadida columna quotes.tags";
                }
                $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'tags'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE invoices ADD COLUMN tags VARCHAR(255) NULL");
                    $changes[] = "Añadida columna invoices.tags";
                }
                echo json_encode([
                    "status" => "success",
                    "message" => $changes ? "Esquema de etiquetas actualizado." : "No había cambios.",
                    "changes" => $changes
                ]);
            } catch (Exception $e) {
                app_log("upgrade_tags_schema error: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'upgrade_projects_schema':
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede actualizar el esquema."]);
                break;
            }
            $changes = [];
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("
                        CREATE TABLE projects (
                            id INT PRIMARY KEY AUTO_INCREMENT,
                            name VARCHAR(255) NOT NULL,
                            description TEXT,
                            client_name VARCHAR(255),
                            client_id INT NULL,
                            status ENUM('planning','in_progress','on_hold','completed','cancelled') DEFAULT 'planning',
                            start_date DATE NULL,
                            end_date DATE NULL,
                            budget DECIMAL(12,2) NULL,
                            user_id INT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                            FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL
                        )
                    ");
                    $changes[] = "Tabla projects creada";
                }
                $chk = $pdo->query("SHOW TABLES LIKE 'project_tasks'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("
                        CREATE TABLE project_tasks (
                            id INT PRIMARY KEY AUTO_INCREMENT,
                            project_id INT NOT NULL,
                            title VARCHAR(255) NOT NULL,
                            description TEXT,
                            due_date DATE NULL,
                            completed TINYINT(1) DEFAULT 0,
                            sort_order INT DEFAULT 0,
                            assigned_to_user_id INT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                            FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
                        )
                    ");
                    $changes[] = "Tabla project_tasks creada";
                } else {
                    $chk = $pdo->query("SHOW COLUMNS FROM project_tasks LIKE 'assigned_to_user_id'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE project_tasks ADD COLUMN assigned_to_user_id INT NULL AFTER sort_order");
                        $changes[] = "Columna project_tasks.assigned_to_user_id añadida";
                    }
                }
                echo json_encode([
                    "status" => "success",
                    "message" => $changes ? "Esquema de proyectos actualizado." : "No había cambios.",
                    "changes" => $changes
                ]);
            } catch (Exception $e) {
                app_log("upgrade_projects_schema error: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'upgrade_deletion_requests_schema':
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede actualizar el esquema."]);
                break;
            }
            $changes = [];
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'deletion_requests'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("
                        CREATE TABLE deletion_requests (
                            id INT PRIMARY KEY AUTO_INCREMENT,
                            table_name ENUM('quotes','invoices') NOT NULL,
                            record_id VARCHAR(50) NOT NULL,
                            requested_by_user_id INT NOT NULL,
                            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            status ENUM('pending','approved','rejected') DEFAULT 'pending',
                            processed_by_user_id INT NULL,
                            processed_at DATETIME NULL,
                            FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
                        )
                    ");
                    $changes[] = "Tabla deletion_requests creada";
                }
                echo json_encode(["status" => "success", "message" => $changes ? "Esquema actualizado." : "No había cambios.", "changes" => $changes]);
            } catch (Exception $e) {
                app_log("upgrade_deletion_requests_schema: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'process_recurring_invoices':
            // Generar nuevas facturas para las recurrentes cuya next_date <= hoy y avanzar su próxima fecha
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede procesar facturas recurrentes."]);
                break;
            }
            try {
                $created = 0;
                $updated = 0;
                // Verificar que las columnas de recurrencia existen
                $hasRecurringCols = false;
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'is_recurring'");
                    $hasRecurringCols = $chk->rowCount() > 0;
                } catch (Exception $e) { $hasRecurringCols = false; }
                if (!$hasRecurringCols) {
                    echo json_encode(["status" => "error", "message" => "La base de datos no tiene columnas de facturas recurrentes (is_recurring, recurrence_frequency, next_date)."]);
                    break;
                }
                // Seleccionar facturas recurrentes vencidas
                $stmt = $pdo->prepare("
                    SELECT * FROM invoices
                    WHERE is_recurring = 1
                      AND next_date IS NOT NULL
                      AND next_date <= CURDATE()
                ");
                $stmt->execute();
                $rec = $stmt->fetchAll(PDO::FETCH_ASSOC);
                if (!$rec) {
                    echo json_encode(["status" => "success", "created" => 0, "updated" => 0, "message" => "No hay facturas recurrentes pendientes."]);
                    break;
                }
                foreach ($rec as $r) {
                    $pdo->beginTransaction();
                    // Calcular siguiente fecha según frecuencia
                    $freq = strtolower(trim($r['recurrence_frequency'] ?? 'monthly'));
                    $interval = "1 MONTH";
                    if ($freq === 'quarterly') $interval = "3 MONTH";
                    elseif ($freq === 'yearly' || $freq === 'annual') $interval = "1 YEAR";
                    // Generar nuevo ID de factura
                    $newId = 'FAC-' . date('YmdHis') . '-' . mt_rand(100, 999);
                    // Insertar nueva factura clonando datos base
                    $ins = $pdo->prepare("
                        INSERT INTO invoices
                        (id, quote_id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount, is_recurring, recurrence_frequency, next_date)
                        VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, NULL, NULL)
                    ");
                    $ins->execute([
                        $newId,
                        $r['quote_id'] ?? null,
                        $r['client_name'] ?? null,
                        $r['client_id'] ?? null,
                        $r['client_address'] ?? null,
                        $r['client_email'] ?? null,
                        $r['client_phone'] ?? null,
                        $r['notes'] ?? null,
                        $r['user_id'] ?? null,
                        $r['subtotal'] ?? 0,
                        $r['tax_amount'] ?? 0,
                        $r['total_amount'] ?? 0
                    ]);
                    // Copiar líneas de la factura
                    $itemsStmt = $pdo->prepare("SELECT description, image_url, quantity, price, tax_percent FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC");
                    $itemsStmt->execute([$r['id']]);
                    $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
                    if ($items) {
                        $insItems = $pdo->prepare("INSERT INTO invoice_items (invoice_id, description, image_url, quantity, price, tax_percent) VALUES (?, ?, ?, ?, ?, ?)");
                        foreach ($items as $it) {
                            $insItems->execute([
                                $newId,
                                $it['description'] ?? '',
                                $it['image_url'] ?? null,
                                $it['quantity'] ?? 1,
                                $it['price'] ?? 0,
                                $it['tax_percent'] ?? 0
                            ]);
                        }
                    }
                    // Avanzar la siguiente fecha de la factura recurrente original
                    $upd = $pdo->prepare("UPDATE invoices SET next_date = DATE_ADD(next_date, INTERVAL $interval) WHERE id = ?");
                    $upd->execute([$r['id']]);
                    // Registrar en audit_log si existe
                    try {
                        $stmtLog = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'create', ?, ?, ?)");
                        $msg = "Factura recurrente generada desde {$r['id']}";
                        $stmtLog->execute(['invoices', $newId, $user_id, $session_username, json_encode([$msg], JSON_UNESCAPED_UNICODE)]);
                    } catch (Exception $e) { }
                    $pdo->commit();
                    $created++;
                    $updated++;
                }
                echo json_encode(["status" => "success", "created" => $created, "updated" => $updated]);
            } catch (Exception $e) {
                try { $pdo->rollBack(); } catch (Exception $e2) {}
                app_log("process_recurring_invoices error: " . $e->getMessage(), 'error');
                echo json_encode(["status" => "error", "message" => "Error al procesar facturas recurrentes"]);
            }
            break;
        case 'get_top_services':
            try {
                // Servicios más facturados en los últimos 90 días
                if ($session_role === 'admin') {
                    $stmt = $pdo->prepare("
                        SELECT qi.description, SUM(qi.quantity * qi.price) AS total
                        FROM quote_items qi
                        JOIN quotes q ON q.id = qi.quote_id
                        WHERE q.date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                        GROUP BY qi.description
                        ORDER BY total DESC
                        LIMIT 5
                    ");
                    $stmt->execute();
                } else {
                    $stmt = $pdo->prepare("
                        SELECT qi.description, SUM(qi.quantity * qi.price) AS total
                        FROM quote_items qi
                        JOIN quotes q ON q.id = qi.quote_id
                        WHERE q.user_id = ? AND q.date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                        GROUP BY qi.description
                        ORDER BY total DESC
                        LIMIT 5
                    ");
                    $stmt->execute([$user_id]);
                }
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as &$r) {
                    $r['description'] = $r['description'] ?? '';
                    $r['total'] = (float)($r['total'] ?? 0);
                }
                unset($r);
                echo json_encode($rows);
            } catch (Exception $e) {
                echo json_encode([]);
            }
            break;
        case 'get_invoice':
            $invoice_id = $_GET['id'] ?? null;
            if (!$invoice_id) {
                echo json_encode(["error" => "ID no proporcionado"], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                break;
            }
            
            // Admin puede ver cualquier factura, usuario normal solo las suyas
            if ($session_role === 'admin') {
                $stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? LIMIT 1");
                $stmt->execute([$invoice_id]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? AND user_id = ? LIMIT 1");
                $stmt->execute([$invoice_id, $user_id]);
            }
            
            $i = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($i) {
                $stmt = $pdo->prepare("SELECT id, invoice_id, description, image_url, quantity, price, tax_percent FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC");
                $stmt->execute([$invoice_id]);
                $i['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // Cargar historial de cambios si la tabla existe
                try {
                    $stmt = $pdo->prepare("SELECT action, username, changes, created_at FROM audit_log WHERE table_name = 'invoices' AND record_id = ? ORDER BY created_at DESC LIMIT 10");
                    $stmt->execute([$invoice_id]);
                    $i['audit_log'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (Exception $e) {
                    $i['audit_log'] = [];
                }
            }
            echo json_encode($i, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            break;
        case 'save_invoice':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id']) || trim($data['id']) === '') {
                echo json_encode(["status" => "error", "message" => "ID de factura requerido"]);
                break;
            }
            if (!isset($data['client']['name']) || trim($data['client']['name']) === '') {
                echo json_encode(["status" => "error", "message" => "Nombre del cliente requerido"]);
                break;
            }
            if (empty($data['items']) || !is_array($data['items'])) {
                echo json_encode(["status" => "error", "message" => "Añade al menos una línea a la factura"]);
                break;
            }
            $pdo->beginTransaction();
            
            // Verificar si es creación o actualización
            $stmt = $pdo->prepare("SELECT id FROM invoices WHERE id = ?");
            $stmt->execute([$data['id']]);
            $exists = $stmt->fetch();
            $action = $exists ? 'update' : 'create';
            
            // Obtener datos anteriores para el log (si es actualización)
            $oldData = null;
            if ($exists) {
                $stmt = $pdo->prepare("SELECT client_name, status, total_amount FROM invoices WHERE id = ?");
                $stmt->execute([$data['id']]);
                $oldData = $stmt->fetch(PDO::FETCH_ASSOC);
            }

            // Datos de recurrencia opcionales
            $recurringData = $data['recurring'] ?? null;
            $isRecurring = ($recurringData && !empty($recurringData['enabled'])) ? 1 : 0;
            $recurrenceFrequency = $recurringData['frequency'] ?? null;
            $nextDate = $recurringData['next_date'] ?? null;

            $inv_project_id = isset($data['project_id']) && $data['project_id'] !== '' ? (int)$data['project_id'] : null;
            $has_project_id_col = false;
            try { $has_project_id_col = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'project_id'")->rowCount() > 0; } catch (Exception $e) {}
            try {
                // Intentar guardar incluyendo columnas de recurrencia y project_id si existen
                if ($has_project_id_col) {
                    $stmt = $pdo->prepare("REPLACE INTO invoices (id, quote_id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount, is_recurring, recurrence_frequency, next_date, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $data['id'],
                        $data['quote_id'] ?? null,
                        $data['date'],
                        $data['client']['name'],
                        $data['client']['id'],
                        $data['client']['address'],
                        $data['client']['email'],
                        $data['client']['phone'] ?? null,
                        $data['notes'],
                        $data['status'],
                        $user_id,
                        $data['totals']['subtotal'],
                        $data['totals']['tax'],
                        $data['totals']['total'],
                        $isRecurring,
                        $recurrenceFrequency ?: null,
                        $nextDate ?: null,
                        $inv_project_id
                    ]);
                } else {
                    throw new PDOException('no project_id');
                }
            } catch (PDOException $e) {
                if (strpos($e->getMessage(), 'project_id') !== false || $e->getMessage() === 'no project_id') {
                    try {
                        $stmt = $pdo->prepare("REPLACE INTO invoices (id, quote_id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount, is_recurring, recurrence_frequency, next_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $data['id'],
                            $data['quote_id'] ?? null,
                            $data['date'],
                            $data['client']['name'],
                            $data['client']['id'],
                            $data['client']['address'],
                            $data['client']['email'],
                            $data['client']['phone'] ?? null,
                            $data['notes'],
                            $data['status'],
                            $user_id,
                            $data['totals']['subtotal'],
                            $data['totals']['tax'],
                            $data['totals']['total'],
                            $isRecurring,
                            $recurrenceFrequency ?: null,
                            $nextDate ?: null
                        ]);
                    } catch (PDOException $e2) {
                        if (strpos($e2->getMessage(), 'is_recurring') !== false || strpos($e2->getMessage(), 'recurrence_frequency') !== false || strpos($e2->getMessage(), 'next_date') !== false) {
                            $stmt = $pdo->prepare("REPLACE INTO invoices (id, quote_id, date, client_name, client_id, client_address, client_email, client_phone, notes, status, user_id, subtotal, tax_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                            $stmt->execute([
                                $data['id'],
                                $data['quote_id'] ?? null,
                                $data['date'],
                                $data['client']['name'],
                                $data['client']['id'],
                                $data['client']['address'],
                                $data['client']['email'],
                                $data['client']['phone'] ?? null,
                        $data['notes'],
                        $data['status'],
                        $user_id,
                        $data['totals']['subtotal'],
                        $data['totals']['tax'],
                        $data['totals']['total']
                    ]);
                        } else {
                            throw $e2;
                        }
                    }
                } else {
                    throw $e;
                }
            }
            if (isset($data['tags']) && trim($data['tags']) !== '') {
                try {
                    if ($pdo->query("SHOW COLUMNS FROM invoices LIKE 'tags'")->rowCount() > 0) {
                        $pdo->prepare("UPDATE invoices SET tags = ? WHERE id = ?")->execute([trim(substr($data['tags'], 0, 255)), $data['id']]);
                    }
                } catch (Exception $e) {}
            }
            $stmt = $pdo->prepare("DELETE FROM invoice_items WHERE invoice_id = ?");
            $stmt->execute([$data['id']]);
            $stmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, description, image_url, quantity, price, tax_percent) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($data['items'] as $item) { $stmt->execute([$data['id'], $item['description'], $item['image_url'] ?? null, $item['quantity'], $item['price'], $item['tax']]); }
            
            // Registrar en audit_log si la tabla existe
            try {
                $changes = [];
                if ($oldData) {
                    if ($oldData['client_name'] != $data['client']['name']) $changes[] = "Cliente: {$oldData['client_name']} → {$data['client']['name']}";
                    if ($oldData['status'] != $data['status']) $changes[] = "Estado: {$oldData['status']} → {$data['status']}";
                    if (abs($oldData['total_amount'] - $data['totals']['total']) > 0.01) $changes[] = "Total: " . number_format($oldData['total_amount'], 2) . "€ → " . number_format($data['totals']['total'], 2) . "€";
                }
                $changesJson = !empty($changes) ? json_encode($changes, JSON_UNESCAPED_UNICODE) : null;
                $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute(['invoices', $data['id'], $action, $user_id, $session_username, $changesJson]);
            } catch (Exception $e) {
                // Si la tabla audit_log no existe, continuar sin error
            }
            
            // Asegurar que la factura tenga user_id por si falló en algún flujo
            try {
                $pdo->prepare("UPDATE invoices SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = 0)")->execute([$user_id, $data['id']]);
            } catch (Exception $e) {}
            $pdo->commit();
            echo json_encode(["status" => "success", "id" => $data['id']]);
            break;
        case 'update_invoice_status':
            $id = $_POST['id'] ?? null;
            $status = $_POST['status'] ?? null;
            if (!$id || !$status) {
                echo json_encode(["status" => "error", "message" => "Parámetros incompletos"]);
                break;
            }
            // Validar estado permitido
            $allowed = ['pending', 'paid', 'cancelled'];
            if (!in_array($status, $allowed, true)) {
                echo json_encode(["status" => "error", "message" => "Estado no permitido"]);
                break;
            }
            try {
                if ($session_role === 'admin') {
                    $stmt = $pdo->prepare("UPDATE invoices SET status = ? WHERE id = ?");
                    $stmt->execute([$status, $id]);
                } else {
                    $stmt = $pdo->prepare("UPDATE invoices SET status = ? WHERE id = ? AND user_id = ?");
                    $stmt->execute([$status, $id, $user_id]);
                }
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => "Error al actualizar estado"]);
            }
            break;
        case 'delete_invoice':
            $inv_id = $_POST['id'] ?? null;
            if (!$inv_id) { echo json_encode(["status" => "error", "message" => "ID requerido"]); break; }
            if ($session_role !== 'admin') {
                echo json_encode(["status" => "error", "message" => "Solo el administrador puede eliminar facturas."]);
                break;
            }
            try {
                $stmt = $pdo->prepare("SELECT id, user_id FROM invoices WHERE id = ?");
                $stmt->execute([$inv_id]);
                $inv = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($inv) {
                    $stmt = $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'delete', ?, ?, ?)");
                    $stmt->execute(['invoices', $inv_id, $user_id, $session_username, 'Factura eliminada por admin']);
                }
            } catch (Exception $e) { }
            $stmt = $pdo->prepare("DELETE FROM invoices WHERE id = ?");
            $stmt->execute([$inv_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'get_dashboard_stats':
            // Consultas optimizadas usando índices, una por una para evitar timeouts
            try {
                $income = 0;
                $pending = 0;
                $expenses = 0;
                $quotes_count = 0;
                $invoices_count = 0;
                
                // Usar índice en user_id y status
                $stmt = $pdo->prepare("SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE user_id = ? AND status = 'paid'");
                $stmt->execute([$user_id]);
                $income = (float)$stmt->fetchColumn();
                
                $stmt = $pdo->prepare("SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE user_id = ? AND status = 'pending'");
                $stmt->execute([$user_id]);
                $pending = (float)$stmt->fetchColumn();
                
                // Usar índice en user_id
                $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = ?");
                $stmt->execute([$user_id]);
                $expenses = (float)$stmt->fetchColumn();
                
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM quotes WHERE user_id = ?");
                $stmt->execute([$user_id]);
                $quotes_count = (int)$stmt->fetchColumn();
                
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM invoices WHERE user_id = ?");
                $stmt->execute([$user_id]);
                $invoices_count = (int)$stmt->fetchColumn();

                echo json_encode([
                    "income" => $income,
                    "pending" => $pending,
                    "expenses" => $expenses,
                    "quotes_count" => $quotes_count,
                    "invoices_count" => $invoices_count
                ]);
            } catch (Exception $e) {
                // Si falla, devolver valores por defecto
                echo json_encode([
                    "income" => 0,
                    "pending" => 0,
                    "expenses" => 0,
                    "quotes_count" => 0,
                    "invoices_count" => 0
                ]);
            }
            break;
        case 'get_overdue_invoices':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $days = (int)($_GET['days'] ?? 30);
                if ($days < 1) $days = 30;
                if ($session_role === 'admin') {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, total_amount FROM invoices WHERE status = 'pending' AND date < DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY date ASC LIMIT 20");
                    $stmt->execute([$days]);
                } else {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, total_amount FROM invoices WHERE user_id = ? AND status = 'pending' AND date < DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY date ASC LIMIT 20");
                    $stmt->execute([$user_id, $days]);
                }
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } catch (Exception $e) {
                echo json_encode([]);
            }
            break;
        case 'get_monthly_revenue':
            if (!$session_user_id) { echo json_encode([]); break; }
            try {
                $months = (int)($_GET['months'] ?? 6);
                if ($months < 1 || $months > 24) $months = 6;
                $rows = [];
                if ($session_role === 'admin') {
                    $stmt = $pdo->query("SELECT DATE_FORMAT(date,'%Y-%m') AS month, COALESCE(SUM(total_amount),0) AS total FROM invoices WHERE status = 'paid' AND date >= DATE_SUB(CURDATE(), INTERVAL $months MONTH) GROUP BY DATE_FORMAT(date,'%Y-%m') ORDER BY month ASC");
                } else {
                    $stmt = $pdo->prepare("SELECT DATE_FORMAT(date,'%Y-%m') AS month, COALESCE(SUM(total_amount),0) AS total FROM invoices WHERE user_id = ? AND status = 'paid' AND date >= DATE_SUB(CURDATE(), INTERVAL $months MONTH) GROUP BY DATE_FORMAT(date,'%Y-%m') ORDER BY month ASC");
                    $stmt->execute([$user_id]);
                }
                while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $rows[] = ["month" => $r['month'], "total" => (float)$r['total']];
                }
                echo json_encode($rows);
            } catch (Exception $e) {
                echo json_encode([]);
            }
            break;
        case 'get_expenses':
            if ($session_role === 'admin') {
                // Admin: consulta optimizada sin JOIN, con límite
                $stmt = $pdo->prepare("SELECT id, date, description, amount, category, user_id FROM expenses ORDER BY date DESC LIMIT 100");
                $stmt->execute();
                $expenses = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // Obtener usernames solo si hay gastos y menos de 20 usuarios
                if (!empty($expenses)) {
                    $userIds = array_filter(array_unique(array_column($expenses, 'user_id')), function($id) { return $id !== null && $id !== ''; });
                    if (!empty($userIds) && count($userIds) <= 20) {
                        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
                        $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id IN ($placeholders)");
                        $stmt->execute(array_values($userIds));
                        $users = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                        
                        foreach ($expenses as &$e) {
                            $e['username'] = (isset($e['user_id']) && $e['user_id'] && isset($users[$e['user_id']])) ? $users[$e['user_id']] : null;
                        }
                        unset($e);
                    } else {
                        foreach ($expenses as &$e) {
                            $e['username'] = null;
                        }
                        unset($e);
                    }
                }
                echo json_encode($expenses);
            } else {
                // Usuario normal solo ve sus propios gastos
                $stmt = $pdo->prepare("SELECT id, date, description, amount, category, user_id FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT 100");
                $stmt->execute([$user_id]);
                $expenses = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($expenses as &$e) {
                    $e['username'] = null; // No necesario para usuario normal
                }
                unset($e);
                echo json_encode($expenses);
            }
            break;
        case 'save_expense':
            $err = validate_required($_POST, ['description', 'amount']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            $amount = (float)($_POST['amount'] ?? 0);
            if ($amount <= 0) { echo json_encode(["status" => "error", "message" => "El importe debe ser mayor que 0"]); break; }
            $stmt = $pdo->prepare("INSERT INTO expenses (description, amount, category, date, user_id) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$_POST['description'], $amount, $_POST['category'] ?? '', $_POST['date'] ?? date('Y-m-d H:i:s'), $user_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'delete_expense':
            $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?");
            $stmt->execute([$_POST['id'], $user_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'delete_catalog_item':
            $pdo->prepare("DELETE FROM catalog WHERE id=?")->execute([$_POST['id']]);
            echo json_encode(["status" => "success"]);
            break;
        case 'save_appointment':
            $err = validate_required($_POST, ['client_name', 'date']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            $stmt = $pdo->prepare("INSERT INTO appointments (user_id, client_name, phone, date, description) VALUES (?,?,?,?,?)");
            $stmt->execute([$user_id, $_POST['client_name'], $_POST['phone'] ?? '', $_POST['date'], $_POST['description'] ?? '']);
            $newId = (int) $pdo->lastInsertId();
            $row = $pdo->query("SELECT id, client_name, phone, date, description FROM appointments WHERE id = " . $newId)->fetch(PDO::FETCH_ASSOC);
            echo json_encode(["status" => "success", "appointment" => $row ?: ["id" => $newId, "client_name" => $_POST['client_name'], "phone" => $_POST['phone'] ?? '', "date" => $_POST['date'], "description" => $_POST['description'] ?? '']]);
            break;
        case 'delete_appointment':
            $pdo->prepare("DELETE FROM appointments WHERE id=? AND user_id=?")->execute([$_POST['id'], $user_id]);
            echo json_encode(["status" => "success"]);
            break;
        case 'get_dashboard_alerts':
            if (!$session_user_id) { echo json_encode(["appointments_today" => [], "draft_quotes" => [], "pending_invoices" => [], "sent_quotes_no_response" => [], "messages" => []]); break; }
            try {
                $alerts = ["appointments_today" => [], "draft_quotes" => [], "pending_invoices" => [], "sent_quotes_no_response" => [], "messages" => []];
                $chk = $pdo->query("SHOW TABLES LIKE 'appointments'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("SELECT id, client_name, phone, date, description FROM appointments WHERE user_id = ? AND DATE(date) = CURDATE() ORDER BY date ASC");
                    $stmt->execute([$user_id]);
                    $alerts["appointments_today"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM quotes WHERE user_id = ? AND status IN ('draft','sent') ORDER BY date DESC LIMIT 20");
                $stmt->execute([$user_id]);
                $alerts["draft_quotes"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT id, date, client_name, total_amount FROM invoices WHERE user_id = ? AND status = 'pending' ORDER BY date ASC LIMIT 20");
                $stmt->execute([$user_id]);
                $alerts["pending_invoices"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT id, date, client_name, status, total_amount FROM quotes WHERE user_id = ? AND status = 'sent' AND date < DATE_SUB(CURDATE(), INTERVAL 7 DAY) ORDER BY date ASC LIMIT 15");
                $stmt->execute([$user_id]);
                $alerts["sent_quotes_no_response"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $chk = $pdo->query("SHOW TABLES LIKE 'user_messages'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("SELECT m.id, m.subject, m.body, m.created_at, u.username AS from_username FROM user_messages m LEFT JOIN users u ON u.id = m.from_user_id WHERE m.to_user_id = ? AND m.read_at IS NULL ORDER BY m.created_at DESC");
                    $stmt->execute([$user_id]);
                    $alerts["messages"] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                echo json_encode($alerts);
            } catch (Exception $e) {
                echo json_encode(["appointments_today" => [], "draft_quotes" => [], "pending_invoices" => [], "sent_quotes_no_response" => [], "messages" => []]);
            }
            break;
        case 'get_month_summary':
            if (!$session_user_id) { echo json_encode(["quotes_count" => 0, "invoices_count" => 0, "total_invoiced" => 0, "quotes_count_prev" => 0, "invoices_count_prev" => 0, "total_invoiced_prev" => 0]); break; }
            try {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM quotes WHERE user_id = ? AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $quotes_count = (int)$stmt->fetchColumn();
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM invoices WHERE user_id = ? AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $invoices_count = (int)$stmt->fetchColumn();
                $stmt = $pdo->prepare("SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE user_id = ? AND status = 'paid' AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $total_invoiced = (float)$stmt->fetchColumn();
                $prev_month_start = "DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')";
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM quotes WHERE user_id = ? AND date >= $prev_month_start AND date < DATE_ADD($prev_month_start, INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $quotes_count_prev = (int)$stmt->fetchColumn();
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM invoices WHERE user_id = ? AND date >= $prev_month_start AND date < DATE_ADD($prev_month_start, INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $invoices_count_prev = (int)$stmt->fetchColumn();
                $stmt = $pdo->prepare("SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE user_id = ? AND status = 'paid' AND date >= $prev_month_start AND date < DATE_ADD($prev_month_start, INTERVAL 1 MONTH)");
                $stmt->execute([$user_id]);
                $total_invoiced_prev = (float)$stmt->fetchColumn();
                echo json_encode(["quotes_count" => $quotes_count, "invoices_count" => $invoices_count, "total_invoiced" => $total_invoiced, "quotes_count_prev" => $quotes_count_prev, "invoices_count_prev" => $invoices_count_prev, "total_invoiced_prev" => $total_invoiced_prev]);
            } catch (Exception $e) {
                echo json_encode(["quotes_count" => 0, "invoices_count" => 0, "total_invoiced" => 0, "quotes_count_prev" => 0, "invoices_count_prev" => 0, "total_invoiced_prev" => 0]);
            }
            break;
        case 'send_user_message':
            if ($session_role !== 'admin') { echo json_encode(["status" => "error", "message" => "No autorizado"]); break; }
            $to_user_id = (int)($_POST['to_user_id'] ?? 0);
            $subject = trim($_POST['subject'] ?? '');
            $body = trim($_POST['body'] ?? '');
            if ($to_user_id < 1) { echo json_encode(["status" => "error", "message" => "Selecciona un usuario"]); break; }
            if ($subject === '' && $body === '') { echo json_encode(["status" => "error", "message" => "Escribe asunto o mensaje"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'user_messages'");
                if ($chk->rowCount() === 0) { echo json_encode(["status" => "error", "message" => "Tabla de mensajes no disponible. Ejecuta actualizar base de datos."]); break; }
                $pdo->prepare("INSERT INTO user_messages (from_user_id, to_user_id, subject, body) VALUES (?, ?, ?, ?)")->execute([$user_id, $to_user_id, $subject ?: null, $body ?: null]);
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error", "message" => $e->getMessage()]);
            }
            break;
        case 'mark_message_read':
            if (!$session_user_id) { echo json_encode(["status" => "error"]); break; }
            $msg_id = (int)($_POST['id'] ?? $_GET['id'] ?? 0);
            if ($msg_id < 1) { echo json_encode(["status" => "error"]); break; }
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'user_messages'");
                if ($chk->rowCount() > 0) {
                    $pdo->prepare("UPDATE user_messages SET read_at = NOW() WHERE id = ? AND to_user_id = ?")->execute([$msg_id, $user_id]);
                }
                echo json_encode(["status" => "success"]);
            } catch (Exception $e) {
                echo json_encode(["status" => "error"]);
            }
            break;
        case 'get_users':
            if ($session_role == 'admin') echo json_encode($pdo->query("SELECT id, username, role FROM users")->fetchAll(PDO::FETCH_ASSOC));
            break;
        case 'save_user':
            if ($session_role == 'admin') {
                $err = validate_required($_POST, ['username', 'password', 'role']);
                if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
                $uid = $_POST['id'] ?? null;
                if ($uid) {
                    $pdo->prepare("UPDATE users SET username=?, password=?, role=? WHERE id=?")->execute([$_POST['username'], $_POST['password'], $_POST['role'], $uid]);
                    try {
                        $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'update', ?, ?, ?)")->execute(['users', $uid, $user_id, $session_username, 'Usuario actualizado']);
                    } catch (Exception $e) { }
                } else {
                    $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)")->execute([$_POST['username'], $_POST['password'], $_POST['role']]);
                    $newUid = $pdo->lastInsertId();
                    try {
                        $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'create', ?, ?, ?)")->execute(['users', $newUid, $user_id, $session_username, 'Usuario creado']);
                    } catch (Exception $e) { }
                }
                echo json_encode(["status" => "success"]);
            }
            break;
        case 'delete_user':
            if ($session_role == 'admin') {
                $duid = $_POST['id'] ?? null;
                if (!$duid) { echo json_encode(["status" => "error", "message" => "ID requerido"]); break; }
                try {
                    $pdo->prepare("INSERT INTO audit_log (table_name, record_id, action, user_id, username, changes) VALUES (?, ?, 'delete', ?, ?, ?)")->execute(['users', $duid, $user_id, $session_username, 'Usuario eliminado']);
                } catch (Exception $e) { }
                $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$duid]);
                echo json_encode(["status" => "success"]);
            }
            break;
        case 'export_csv':
            $type = $_GET['type'] ?? 'quotes';
            $allowed = ['quotes', 'invoices', 'customers', 'expenses', 'projects'];
            if (!in_array($type, $allowed, true)) {
                echo json_encode(["status" => "error", "message" => "Tipo no permitido"]);
                break;
            }
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="export_' . $type . '_' . date('Y-m-d') . '.csv"');
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF)); // BOM UTF-8
            if ($type === 'quotes') {
                fputcsv($out, ['id', 'date', 'client_name', 'client_id', 'status', 'subtotal', 'tax_amount', 'total_amount']);
                if ($session_role === 'admin') {
                    $stmt = $pdo->query("SELECT id, date, client_name, client_id, status, subtotal, tax_amount, total_amount FROM quotes ORDER BY date DESC");
                } else {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, client_id, status, subtotal, tax_amount, total_amount FROM quotes WHERE user_id = ? ORDER BY date DESC");
                    $stmt->execute([$user_id]);
                }
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { fputcsv($out, $row); }
            } elseif ($type === 'invoices') {
                fputcsv($out, ['id', 'date', 'client_name', 'client_id', 'status', 'subtotal', 'tax_amount', 'total_amount']);
                if ($session_role === 'admin') {
                    $stmt = $pdo->query("SELECT id, date, client_name, client_id, status, subtotal, tax_amount, total_amount FROM invoices ORDER BY date DESC");
                } else {
                    $stmt = $pdo->prepare("SELECT id, date, client_name, client_id, status, subtotal, tax_amount, total_amount FROM invoices WHERE user_id = ? ORDER BY date DESC");
                    $stmt->execute([$user_id]);
                }
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { fputcsv($out, $row); }
            } elseif ($type === 'customers') {
                $custCols = ['id', 'name', 'tax_id', 'address', 'email', 'phone'];
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM customers LIKE 'notes'");
                    if ($chk->rowCount() > 0) $custCols = array_merge($custCols, ['notes', 'category', 'lead_source', 'birthday']);
                } catch (Exception $e) { }
                fputcsv($out, $custCols);
                $colsStr = implode(', ', $custCols);
                if ($session_role === 'admin') {
                    $stmt = $pdo->query("SELECT $colsStr FROM customers ORDER BY name ASC");
                } else {
                    $stmt = $pdo->prepare("SELECT $colsStr FROM customers WHERE user_id = ? OR user_id IS NULL ORDER BY name ASC");
                    $stmt->execute([$user_id]);
                }
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { fputcsv($out, $row); }
            } elseif ($type === 'expenses') {
                fputcsv($out, ['id', 'date', 'description', 'amount', 'category']);
                if ($session_role === 'admin') {
                    $stmt = $pdo->query("SELECT id, date, description, amount, category FROM expenses ORDER BY date DESC");
                } else {
                    $stmt = $pdo->prepare("SELECT id, date, description, amount, category FROM expenses WHERE user_id = ? ORDER BY date DESC");
                    $stmt->execute([$user_id]);
                }
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { fputcsv($out, $row); }
            } elseif ($type === 'projects') {
                $chk = $pdo->query("SHOW TABLES LIKE 'projects'");
                if ($chk->rowCount() === 0) { fputcsv($out, ['id', 'name', 'description', 'client_name', 'status', 'start_date', 'end_date', 'budget']); }
                else {
                    fputcsv($out, ['id', 'name', 'description', 'client_name', 'status', 'start_date', 'end_date', 'budget']);
                    if ($session_role === 'admin') {
                        $stmt = $pdo->query("SELECT id, name, description, client_name, status, start_date, end_date, budget FROM projects ORDER BY id DESC");
                    } else {
                        $stmt = $pdo->prepare("SELECT id, name, description, client_name, status, start_date, end_date, budget FROM projects WHERE user_id = ? ORDER BY id DESC");
                        $stmt->execute([$user_id]);
                    }
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) { fputcsv($out, $row); }
                }
            }
            fclose($out);
            exit;
        case 'export_invoices_accounting':
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="facturas_contabilidad_' . date('Y-m-d') . '.csv"');
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
            fputcsv($out, ['Fecha', 'Número', 'Cliente', 'NIF/CIF', 'Base imponible', 'IVA', 'Total', 'Estado']);
            if ($session_role === 'admin') {
                $stmt = $pdo->query("SELECT date, id, client_name, client_id, subtotal, tax_amount, total_amount, status FROM invoices ORDER BY date ASC");
            } else {
                $stmt = $pdo->prepare("SELECT date, id, client_name, client_id, subtotal, tax_amount, total_amount, status FROM invoices WHERE user_id = ? ORDER BY date ASC");
                $stmt->execute([$user_id]);
            }
            $statusMap = ['pending' => 'Pendiente', 'paid' => 'Pagada', 'cancelled' => 'Anulada'];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $date = isset($row['date']) ? date('d/m/Y', strtotime($row['date'])) : '';
                $status = $statusMap[$row['status'] ?? ''] ?? $row['status'];
                fputcsv($out, [$date, $row['id'] ?? '', $row['client_name'] ?? '', $row['client_id'] ?? '', $row['subtotal'] ?? '', $row['tax_amount'] ?? '', $row['total_amount'] ?? '', $status]);
            }
            fclose($out);
            exit;
        case 'backup_data':
            $backup = ['date' => date('Y-m-d H:i:s'), 'user_id' => $user_id, 'quotes' => [], 'invoices' => [], 'customers' => [], 'expenses' => [], 'appointments' => []];
            if ($session_role === 'admin') {
                $backup['quotes'] = $pdo->query("SELECT * FROM quotes ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['invoices'] = $pdo->query("SELECT * FROM invoices ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['customers'] = $pdo->query("SELECT * FROM customers ORDER BY name")->fetchAll(PDO::FETCH_ASSOC);
                $backup['expenses'] = $pdo->query("SELECT * FROM expenses ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['appointments'] = $pdo->query("SELECT * FROM appointments ORDER BY date")->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM quotes WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['quotes'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['invoices'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM customers WHERE user_id = ? OR user_id IS NULL ORDER BY name");
                $stmt->execute([$user_id]);
                $backup['customers'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['expenses'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM appointments WHERE user_id = ? ORDER BY date");
                $stmt->execute([$user_id]);
                $backup['appointments'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="backup_presup_' . date('Y-m-d_His') . '.json"');
            echo json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            exit;
        case 'send_email':
            $to = trim($_POST['to'] ?? '');
            $subject = trim($_POST['subject'] ?? 'Presupuesto / Factura');
            $body = trim($_POST['body'] ?? '');
            if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
                echo json_encode(["status" => "error", "message" => "Email de destino no válido"]);
                break;
            }
            // Remitente: empresa actual (companies) o company_settings
            $fromEmail = null;
            $fromName = null;
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("SELECT email, sender_name FROM companies WHERE id = ?");
                    $stmt->execute([$current_company_id]);
                    $cfg = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($cfg) {
                        $fromEmail = $cfg['email'] ?? null;
                        $fromName = $cfg['sender_name'] ?? null;
                    }
                }
                if ($fromEmail === null || $fromEmail === '') {
                    $stmt = $pdo->query("SELECT email, sender_name FROM company_settings WHERE id = 1");
                    $cfg = $stmt->fetch(PDO::FETCH_ASSOC);
                    $fromEmail = $cfg['email'] ?? null;
                    $fromName = $cfg['sender_name'] ?? null;
                }
            } catch (Exception $e) {}
            if (!$fromEmail) $fromEmail = 'noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
            $fromHeader = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
            $pdfB64 = $_POST['pdf_base64'] ?? '';
            $pdfFilename = trim($_POST['pdf_filename'] ?? 'documento.pdf');
            $boundary = md5(uniqid());
            $headers = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{$boundary}\"\r\nFrom: {$fromHeader}\r\n";
            $msg = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . base64_encode($body ?: 'Adjunto encontrará el documento.') . "\r\n";
            if ($pdfB64 !== '') {
                $msg .= "--{$boundary}\r\nContent-Type: application/pdf; name=\"" . basename($pdfFilename) . "\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"" . basename($pdfFilename) . "\"\r\n\r\n" . preg_replace('/\s/', '', $pdfB64) . "\r\n";
            }
            $msg .= "--{$boundary}--";
            $ok = @mail($to, $subject, $msg, $headers);
            echo json_encode($ok ? ["status" => "success"] : ["status" => "error", "message" => "No se pudo enviar el correo. Revisa la configuración del servidor."]);
            break;
        case 'send_backup_email':
            $to = trim($_POST['to'] ?? '');
            if (!$to) {
                $stmt = $pdo->query("SELECT backup_email FROM company_settings WHERE id = 1");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                $to = $row['backup_email'] ?? '';
            }
            if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
                echo json_encode(["status" => "error", "message" => "Indica un email de destino o configura 'Backup por email' en Configuración"]);
                break;
            }
            $backup = ['date' => date('Y-m-d H:i:s'), 'quotes' => [], 'invoices' => [], 'customers' => [], 'expenses' => [], 'appointments' => []];
            if ($session_role === 'admin') {
                $backup['quotes'] = $pdo->query("SELECT * FROM quotes ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['invoices'] = $pdo->query("SELECT * FROM invoices ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['customers'] = $pdo->query("SELECT * FROM customers ORDER BY name")->fetchAll(PDO::FETCH_ASSOC);
                $backup['expenses'] = $pdo->query("SELECT * FROM expenses ORDER BY date DESC")->fetchAll(PDO::FETCH_ASSOC);
                $backup['appointments'] = $pdo->query("SELECT * FROM appointments ORDER BY date")->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM quotes WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['quotes'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['invoices'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM customers WHERE user_id = ? OR user_id IS NULL ORDER BY name");
                $stmt->execute([$user_id]);
                $backup['customers'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC");
                $stmt->execute([$user_id]);
                $backup['expenses'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $stmt = $pdo->prepare("SELECT * FROM appointments WHERE user_id = ? ORDER BY date");
                $stmt->execute([$user_id]);
                $backup['appointments'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            $json = json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            $stmt = $pdo->query("SELECT email, sender_name FROM company_settings WHERE id = 1");
            $cfg = $stmt->fetch(PDO::FETCH_ASSOC);
            $fromEmail = $cfg['email'] ?? 'noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
            $fromName = $cfg['sender_name'] ?? null;
            $fromHeader = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
            $boundary = md5(uniqid());
            $filename = 'backup_presup_' . date('Y-m-d_His') . '.json';
            $headers = "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{$boundary}\"\r\nFrom: {$fromHeader}\r\n";
            $msg = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . base64_encode("Copia de seguridad PRESUNAVEGATEL " . date('d/m/Y H:i')) . "\r\n";
            $msg .= "--{$boundary}\r\nContent-Type: application/json; name=\"{$filename}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n" . base64_encode($json) . "\r\n--{$boundary}--";
            $ok = @mail($to, "Copia de seguridad PRESUNAVEGATEL " . date('d/m/Y'), $msg, $headers);
            echo json_encode($ok ? ["status" => "success"] : ["status" => "error", "message" => "No se pudo enviar el correo."]);
            break;
        case 'get_next_invoice_number':
            if (!$session_user_id) {
                echo json_encode(["next_id" => null]);
                break;
            }
            try {
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'invoice_prefix'");
                if ($chk->rowCount() === 0) { echo json_encode(["next_id" => null]); break; }
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'invoice_next_number'");
                if ($chk->rowCount() === 0) { echo json_encode(["next_id" => null]); break; }
                $stmt = $pdo->query("SELECT invoice_prefix, invoice_next_number FROM company_settings WHERE id = 1");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row || (int)($row['invoice_next_number'] ?? 0) < 1) {
                    echo json_encode(["next_id" => null]);
                    break;
                }
                $prefix = trim($row['invoice_prefix'] ?? 'FAC') ?: 'FAC';
                $num = (int)$row['invoice_next_number'];
                $year = date('Y');
                $next_id = $prefix . '-' . $year . '-' . str_pad($num, 4, '0', STR_PAD_LEFT);
                $pdo->prepare("UPDATE company_settings SET invoice_next_number = invoice_next_number + 1 WHERE id = 1")->execute();
                echo json_encode(["next_id" => $next_id]);
            } catch (Exception $e) {
                echo json_encode(["next_id" => null]);
            }
            break;
        case 'get_settings':
            $settings = null;
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
                if ($chk->rowCount() > 0) {
                    $stmt = $pdo->prepare("SELECT * FROM companies WHERE id = ?");
                    $stmt->execute([$current_company_id]);
                    $settings = $stmt->fetch(PDO::FETCH_ASSOC);
                }
                if (!$settings) {
                    $stmt = $pdo->query("SELECT * FROM company_settings WHERE id = 1");
                    $settings = $stmt->fetch(PDO::FETCH_ASSOC);
                }
            } catch (Exception $e) {
                $stmt = $pdo->query("SELECT * FROM company_settings WHERE id = 1");
                $settings = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            // Asegurar valores por defecto para nuevas opciones de plantilla
            if ($settings && !isset($settings['default_template'])) {
                $settings['default_template'] = 'classic';
            }
            if ($settings && !isset($settings['template_scope'])) {
                $settings['template_scope'] = 'both';
            }
            // Avisos globales (company_settings): asegurar alerts_enabled y appointment_reminders_enabled para cualquier origen de $settings
            if ($settings && is_array($settings)) {
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'alerts_enabled'");
                    if ($chk->rowCount() > 0) {
                        $row = $pdo->query("SELECT alerts_enabled FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
                        if ($row !== false && array_key_exists('alerts_enabled', $row)) $settings['alerts_enabled'] = $row['alerts_enabled'];
                    }
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'appointment_reminders_enabled'");
                    if ($chk->rowCount() > 0) {
                        $row = $pdo->query("SELECT appointment_reminders_enabled FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
                        if ($row !== false && array_key_exists('appointment_reminders_enabled', $row)) $settings['appointment_reminders_enabled'] = $row['appointment_reminders_enabled'];
                    }
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'backup_schedule'");
                    if ($chk->rowCount() > 0) {
                        $row = $pdo->query("SELECT backup_schedule, backup_schedule_day, backup_schedule_monthday, backup_schedule_hour, backup_webhook_url, backup_dest_webhook, backup_dest_email FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
                        if ($row !== false) {
                            foreach (['backup_schedule', 'backup_schedule_day', 'backup_schedule_monthday', 'backup_schedule_hour', 'backup_webhook_url', 'backup_dest_webhook', 'backup_dest_email'] as $k) {
                                if (array_key_exists($k, $row)) $settings[$k] = $row[$k];
                            }
                        }
                    }
                } catch (Exception $e) { /* ignorar */ }
            }
            echo json_encode($settings ?: ["status" => "error", "message" => "No se encontró configuración"]);
            break;
        case 'get_document_templates':
            $templates = [];
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'document_templates'");
                if ($chk->rowCount() === 0) {
                    $pdo->exec("CREATE TABLE document_templates (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        name VARCHAR(100) NOT NULL,
                        type ENUM('quote','invoice') NOT NULL DEFAULT 'quote',
                        notes TEXT,
                        items_json TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_name_type (name, type)
                    )");
                    $pdo->exec("INSERT IGNORE INTO document_templates (name, type, notes, items_json) VALUES
                        ('Presupuesto instalación', 'quote', 'Condiciones de pago: 50% a la firma, 50% a la entrega.\nValidez del presupuesto: 30 días.', '[{\"description\":\"Instalación y configuración\",\"quantity\":1,\"price\":0,\"tax\":21},{\"description\":\"Material y suministros\",\"quantity\":1,\"price\":0,\"tax\":21}]'),
                        ('Factura de mantenimiento', 'invoice', 'Pago por transferencia. Incluye revisión y soporte según contrato.', '[{\"description\":\"Mantenimiento mensual\",\"quantity\":1,\"price\":0,\"tax\":21}]'),
                        ('Presupuesto reparación', 'quote', 'Diagnóstico incluido. Presupuesto sin compromiso.', '[{\"description\":\"Diagnóstico\",\"quantity\":1,\"price\":0,\"tax\":21},{\"description\":\"Reparación / mano de obra\",\"quantity\":1,\"price\":0,\"tax\":21},{\"description\":\"Material / piezas\",\"quantity\":1,\"price\":0,\"tax\":21}]')");
                }
                if ($chk->rowCount() > 0 || $pdo->query("SHOW TABLES LIKE 'document_templates'")->rowCount() > 0) {
                    $type = isset($_REQUEST['type']) ? preg_replace('/[^a-z]/', '', strtolower($_REQUEST['type'])) : '';
                    $sql = "SELECT id, name, type, notes, items_json FROM document_templates WHERE 1=1";
                    $params = [];
                    if ($type === 'quote' || $type === 'invoice') {
                        $sql .= " AND type = ?";
                        $params[] = $type;
                    }
                    $sql .= " ORDER BY type, name";
                    $stmt = $params ? $pdo->prepare($sql) : $pdo->query($sql);
                    if ($params) $stmt->execute($params);
                    $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
            } catch (Exception $e) {
                $templates = [];
            }
            echo json_encode($templates);
            break;
        case 'save_settings':
            $err = validate_required($_POST, ['name']);
            if ($err) { echo json_encode(["status" => "error", "message" => $err['message']]); break; }
            if (!validate_email($_POST['email'] ?? '')) { echo json_encode(["status" => "error", "message" => "Email no válido"]); break; }
            $vendomiaKey = trim($_POST['vendomia_api_key'] ?? '');
            $defaultTemplate = trim($_POST['default_template'] ?? 'classic');
            $templateScope = trim($_POST['template_scope'] ?? 'both');
            $useCompanies = false;
            try {
                $chk = $pdo->query("SHOW TABLES LIKE 'companies'");
                if ($chk->rowCount() > 0) {
                    // Intentar actualizar también campos de plantilla si existen
                    try {
                        $stmt = $pdo->prepare("UPDATE companies SET name=?, cif=?, email=?, address=?, default_tax=?, vendomia_api_key=?, default_template=?, template_scope=? WHERE id=?");
                        $stmt->execute([$_POST['name'] ?? '', $_POST['cif'] ?? '', $_POST['email'] ?? '', $_POST['address'] ?? '', (float)($_POST['default_tax'] ?? 21), $vendomiaKey ?: null, $defaultTemplate, $templateScope, $current_company_id]);
                    } catch (PDOException $e) {
                        // Fallback si aún no existen las columnas nuevas
                        if (strpos($e->getMessage(), 'default_template') !== false || strpos($e->getMessage(), 'template_scope') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                            $stmt = $pdo->prepare("UPDATE companies SET name=?, cif=?, email=?, address=?, default_tax=?, vendomia_api_key=? WHERE id=?");
                            $stmt->execute([$_POST['name'] ?? '', $_POST['cif'] ?? '', $_POST['email'] ?? '', $_POST['address'] ?? '', (float)($_POST['default_tax'] ?? 21), $vendomiaKey ?: null, $current_company_id]);
                        } else {
                            throw $e;
                        }
                    }
                    $useCompanies = true;
                }
            } catch (PDOException $e) { }
            if (!$useCompanies) {
                try {
                    $stmt = $pdo->prepare("REPLACE INTO company_settings (id, name, cif, email, address, default_tax, vendomia_api_key, default_template, template_scope) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$_POST['name'] ?? '', $_POST['cif'] ?? '', $_POST['email'] ?? '', $_POST['address'] ?? '', (float)($_POST['default_tax'] ?? 21), $vendomiaKey ?: null, $defaultTemplate, $templateScope]);
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'vendomia_api_key') !== false || strpos($e->getMessage(), 'default_template') !== false || strpos($e->getMessage(), 'template_scope') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                        $stmt = $pdo->prepare("REPLACE INTO company_settings (id, name, cif, email, address, default_tax) VALUES (1, ?, ?, ?, ?, ?)");
                        $stmt->execute([$_POST['name'] ?? '', $_POST['cif'] ?? '', $_POST['email'] ?? '', $_POST['address'] ?? '', (float)($_POST['default_tax'] ?? 21)]);
                    } else throw $e;
                }
            }
            try {
                $senderName = trim($_POST['sender_name'] ?? '');
                $docLang = in_array($_POST['document_language'] ?? '', ['es', 'en']) ? $_POST['document_language'] : 'es';
                $paymentUrl = trim($_POST['payment_link_url'] ?? '');
                $paymentEnabled = isset($_POST['payment_enabled']) && $_POST['payment_enabled'] ? 1 : 0;
                $backupEmail = trim($_POST['backup_email'] ?? '');
                if ($backupEmail !== '' && !validate_email($backupEmail)) {
                    echo json_encode(["status" => "error", "message" => "Email de backup no válido"]);
                    break;
                }
                $documentFooter = trim($_POST['document_footer'] ?? '');
                $documentLogoUrl = trim($_POST['document_logo_url'] ?? '');
                if ($useCompanies) {
                    $stmt = $pdo->prepare("UPDATE companies SET sender_name=?, document_language=?, payment_link_url=?, payment_enabled=?, backup_email=?, document_footer=? WHERE id=?");
                    $stmt->execute([$senderName ?: null, $docLang, $paymentUrl ?: null, $paymentEnabled, $backupEmail ?: null, $documentFooter ?: null, $current_company_id]);
                } else {
                    $stmt = $pdo->prepare("UPDATE company_settings SET sender_name=?, document_language=?, payment_link_url=?, payment_enabled=?, backup_email=?, document_footer=? WHERE id=1");
                    $stmt->execute([$senderName ?: null, $docLang, $paymentUrl ?: null, $paymentEnabled, $backupEmail ?: null, $documentFooter ?: null]);
                }
                // Plantilla de email para envío de presupuestos/facturas
                try {
                    foreach (['document_email_subject', 'document_email_body'] as $col) {
                        if ($pdo->query("SHOW COLUMNS FROM company_settings LIKE '$col'")->rowCount() === 0) {
                            $pdo->exec("ALTER TABLE company_settings ADD COLUMN $col TEXT NULL");
                        }
                    }
                    $emailSubj = trim($_POST['document_email_subject'] ?? '');
                    $emailBody = trim($_POST['document_email_body'] ?? '');
                    $pdo->prepare("UPDATE company_settings SET document_email_subject = ?, document_email_body = ? WHERE id = 1")->execute([$emailSubj ?: null, $emailBody ?: null]);
                } catch (Exception $e) {
                    if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings document_email_template: " . $e->getMessage(), 'error');
                }
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'document_logo_url'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE company_settings ADD COLUMN document_logo_url VARCHAR(1024) DEFAULT NULL");
                    }
                    $pdo->prepare("UPDATE company_settings SET document_logo_url = ? WHERE id = 1")->execute([$documentLogoUrl !== '' ? $documentLogoUrl : null]);
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings document_logo_url: " . $e->getMessage(), 'error');
                }
                try {
                    $paymentMethods = trim($_POST['payment_methods'] ?? '');
                    $paymentTransferDetails = trim($_POST['payment_transfer_details'] ?? '');
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'payment_methods'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE company_settings ADD COLUMN payment_methods VARCHAR(255) DEFAULT NULL");
                    }
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'payment_transfer_details'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE company_settings ADD COLUMN payment_transfer_details TEXT DEFAULT NULL");
                    }
                    $pdo->prepare("UPDATE company_settings SET payment_methods = ?, payment_transfer_details = ? WHERE id = 1")->execute([$paymentMethods !== '' ? $paymentMethods : null, $paymentTransferDetails !== '' ? $paymentTransferDetails : null]);
                } catch (PDOException $e) {
                    if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings payment_methods: " . $e->getMessage(), 'error');
                }
            } catch (PDOException $e) {
                if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings optional columns: " . $e->getMessage(), 'error');
            }
            try {
                $invPrefix = trim($_POST['invoice_prefix'] ?? '');
                $invNextRaw = $_POST['invoice_next_number'] ?? null;
                $invNext = ($invNextRaw !== null && $invNextRaw !== '') ? (int)$invNextRaw : null;
                if ($invPrefix !== '' || $invNext !== null) {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'invoice_prefix'");
                    if ($chk->rowCount() > 0) {
                        $prefixVal = $invPrefix !== '' ? $invPrefix : 'FAC';
                        $numVal = $invNext !== null ? max(0, $invNext) : 1;
                        $stmt = $pdo->prepare("UPDATE company_settings SET invoice_prefix = ?, invoice_next_number = ? WHERE id = 1");
                        $stmt->execute([$prefixVal, $numVal]);
                    }
                }
            } catch (Exception $e) {
                if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings invoice numbering: " . $e->getMessage(), 'error');
            }
            if ($session_role === 'admin' && isset($_POST['appointment_reminders_enabled'])) {
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'appointment_reminders_enabled'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE company_settings ADD COLUMN appointment_reminders_enabled TINYINT(1) DEFAULT 1");
                    }
                    $reminders = isset($_POST['appointment_reminders_enabled']) && $_POST['appointment_reminders_enabled'] ? 1 : 0;
                    $pdo->prepare("UPDATE company_settings SET appointment_reminders_enabled = ? WHERE id = 1")->execute([$reminders]);
                } catch (Exception $e) {
                    if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings appointment_reminders: " . $e->getMessage(), 'error');
                }
            }
            if ($session_role === 'admin' && array_key_exists('alerts_enabled', $_POST)) {
                try {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'alerts_enabled'");
                    if ($chk->rowCount() === 0) {
                        $pdo->exec("ALTER TABLE company_settings ADD COLUMN alerts_enabled TINYINT(1) DEFAULT 1");
                    }
                    $alerts = isset($_POST['alerts_enabled']) && $_POST['alerts_enabled'] ? 1 : 0;
                    $pdo->prepare("UPDATE company_settings SET alerts_enabled = ? WHERE id = 1")->execute([$alerts]);
                } catch (Exception $e) {
                    if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings alerts_enabled: " . $e->getMessage(), 'error');
                }
            }
            // Copias programadas y destino webhook/nube
            try {
                $cols = ['backup_schedule', 'backup_schedule_day', 'backup_schedule_hour', 'backup_webhook_url', 'backup_dest_webhook', 'backup_dest_email'];
                foreach ($cols as $c) {
                    $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE '$c'");
                    if ($chk->rowCount() === 0) {
                        if ($c === 'backup_webhook_url') $pdo->exec("ALTER TABLE company_settings ADD COLUMN $c TEXT NULL");
                        elseif (in_array($c, ['backup_dest_webhook', 'backup_dest_email'])) $pdo->exec("ALTER TABLE company_settings ADD COLUMN $c TINYINT(1) DEFAULT 1");
                        else $pdo->exec("ALTER TABLE company_settings ADD COLUMN $c VARCHAR(20) NULL");
                    }
                }
                $chk = $pdo->query("SHOW COLUMNS FROM company_settings LIKE 'backup_schedule_monthday'");
                if ($chk->rowCount() === 0) $pdo->exec("ALTER TABLE company_settings ADD COLUMN backup_schedule_monthday TINYINT DEFAULT 1");
                $sched = in_array($_POST['backup_schedule'] ?? '', ['off', 'daily', 'weekly', 'monthly']) ? $_POST['backup_schedule'] : 'off';
                $schedDay = (int)($_POST['backup_schedule_day'] ?? 0);
                $schedMonthDay = min(28, max(1, (int)($_POST['backup_schedule_monthday'] ?? 1)));
                $schedHour = min(23, max(0, (int)($_POST['backup_schedule_hour'] ?? 8)));
                $webhookUrl = trim($_POST['backup_webhook_url'] ?? '');
                $destWebhook = isset($_POST['backup_dest_webhook']) && $_POST['backup_dest_webhook'] ? 1 : 0;
                $destEmail = isset($_POST['backup_dest_email']) && $_POST['backup_dest_email'] ? 1 : 0;
                $pdo->prepare("UPDATE company_settings SET backup_schedule=?, backup_schedule_day=?, backup_schedule_monthday=?, backup_schedule_hour=?, backup_webhook_url=?, backup_dest_webhook=?, backup_dest_email=? WHERE id=1")
                    ->execute([$sched, $schedDay, $schedMonthDay, $schedHour, $webhookUrl !== '' ? $webhookUrl : null, $destWebhook, $destEmail]);
            } catch (Exception $e) {
                if (strpos($e->getMessage(), 'Unknown column') === false) app_log("save_settings backup_schedule: " . $e->getMessage(), 'error');
            }
            echo json_encode(["status" => "success"]);
            break;
    }
} catch (Exception $e) {
    app_log("API Exception: " . $e->getMessage(), 'error');
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
