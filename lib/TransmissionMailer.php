<?php
/**
 * Envío de correo vía APIs (Resend, SendGrid, Mailgun).
 * Sin dependencias externas; usa stream_context para HTTP.
 * @return array ['ok' => bool, 'error' => string]
 */
class TransmissionMailer
{
    /**
     * Envía un correo usando el proveedor indicado.
     * @param string $provider 'resend' | 'sendgrid' | 'mailgun'
     * @param array $config ['api_key' => string, 'from_email' => string, 'from_name' => string]
     *        Mailgun además: 'domain' => string (ej. mg.midominio.com)
     * @param string $to Destinatario
     * @param string $subject Asunto
     * @param string $bodyText Cuerpo en texto plano
     * @param string|null $pdfPath Ruta al PDF o null
     * @param string $pdfFilename Nombre del adjunto
     * @return array ['ok' => bool, 'error' => string]
     */
    public static function send($provider, array $config, $to, $subject, $bodyText, $pdfPath = null, $pdfFilename = 'documento.pdf')
    {
        $apiKey = trim((string)($config['api_key'] ?? ''));
        $fromEmail = trim((string)($config['from_email'] ?? ''));
        $fromName = trim((string)($config['from_name'] ?? ''));
        if ($apiKey === '' || $fromEmail === '') {
            return ['ok' => false, 'error' => 'Faltan API key o email remitente.'];
        }
        $bodyText = $bodyText ?: 'Adjunto encontrará el documento.';
        $bodyHtml = self::textToHtml($bodyText);

        switch (strtolower($provider)) {
            case 'resend':
                return self::sendResend($apiKey, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename);
            case 'sendgrid':
                return self::sendSendGrid($apiKey, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename);
            case 'mailgun':
                $domain = trim((string)($config['domain'] ?? ''));
                if ($domain === '') {
                    return ['ok' => false, 'error' => 'Mailgun requiere el dominio (ej. mg.tudominio.com).'];
                }
                return self::sendMailgun($apiKey, $domain, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename);
            default:
                return ['ok' => false, 'error' => 'Proveedor no soportado: ' . $provider];
        }
    }

    private static function textToHtml($text)
    {
        $safe = htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $withBr = nl2br($safe, false);
        return '<div style="font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px;">' . $withBr . '</div>';
    }

    private static function sendResend($apiKey, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename)
    {
        $from = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
        $payload = [
            'from' => $from,
            'to' => [$to],
            'subject' => $subject,
            'text' => $bodyText,
            'html' => $bodyHtml,
        ];
        if ($pdfPath !== null && is_file($pdfPath)) {
            $payload['attachments'] = [
                ['filename' => $pdfFilename, 'content' => base64_encode(file_get_contents($pdfPath))]
            ];
        }
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$apiKey}\r\n",
                'content' => json_encode($payload),
                'timeout' => 30,
            ]
        ]);
        $resp = @file_get_contents('https://api.resend.com/emails', false, $ctx);
        $code = (int)(isset($http_response_header[0]) ? preg_replace('/\D/', '', explode(' ', $http_response_header[0])[1] ?? 0) : 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true];
        }
        $err = 'Resend rechazó el envío.';
        if ($resp !== false) {
            $j = json_decode($resp, true);
            if (isset($j['message'])) {
                $err = $j['message'];
            }
        }
        // Si falla por dominio no verificado (403), reintentar con remitente de prueba de Resend
        $isResendDomain = (stripos($fromEmail, '@resend.dev') !== false);
        if ($code === 403 && !$isResendDomain && (stripos($err, 'domain') !== false || stripos($err, 'verify') !== false || stripos($err, 'own email') !== false)) {
            $fallbackFrom = ($fromName ?: 'Presup') . ' <onboarding@resend.dev>';
            $payload['from'] = $fallbackFrom;
            $ctx2 = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$apiKey}\r\n",
                    'content' => json_encode($payload),
                    'timeout' => 30,
                ]
            ]);
            $resp2 = @file_get_contents('https://api.resend.com/emails', false, $ctx2);
            $code2 = (int)(isset($http_response_header[0]) ? preg_replace('/\D/', '', explode(' ', $http_response_header[0])[1] ?? 0) : 0);
            if ($code2 >= 200 && $code2 < 300) {
                return ['ok' => true, 'resend_fallback' => true];
            }
        }
        if (strpos($err, 'resend.com/domains') === false && $code === 403) {
            $err .= ' Para enviar con tu dominio, verifica el dominio en resend.com/domains. Para pruebas sin verificar, pon en Configuración → Empresa como email: onboarding@resend.dev';
        }
        return ['ok' => false, 'error' => $err];
    }

    private static function sendSendGrid($apiKey, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename)
    {
        $payload = [
            'personalizations' => [['to' => [['email' => $to]]]],
            'from' => ['email' => $fromEmail, 'name' => $fromName ?: $fromEmail],
            'subject' => $subject,
            'content' => [
                ['type' => 'text/plain', 'value' => $bodyText],
                ['type' => 'text/html', 'value' => $bodyHtml],
            ],
        ];
        if ($pdfPath !== null && is_file($pdfPath)) {
            $payload['attachments'] = [
                [
                    'content' => base64_encode(file_get_contents($pdfPath)),
                    'filename' => $pdfFilename,
                    'type' => 'application/pdf',
                    'disposition' => 'attachment',
                ]
            ];
        }
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$apiKey}\r\n",
                'content' => json_encode($payload),
                'timeout' => 30,
            ]
        ]);
        $resp = @file_get_contents('https://api.sendgrid.com/v3/mail/send', false, $ctx);
        $code = (int)(isset($http_response_header[0]) ? preg_replace('/\D/', '', explode(' ', $http_response_header[0])[1] ?? 0) : 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true];
        }
        $err = 'SendGrid rechazó el envío.';
        if ($resp !== false) {
            $j = json_decode($resp, true);
            if (isset($j['errors'][0]['message'])) {
                $err = $j['errors'][0]['message'];
            }
        }
        return ['ok' => false, 'error' => $err];
    }

    private static function sendMailgun($apiKey, $domain, $fromEmail, $fromName, $to, $subject, $bodyText, $bodyHtml, $pdfPath, $pdfFilename)
    {
        $from = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
        $boundary = '----presup' . bin2hex(random_bytes(8));
        $body = "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"from\"\r\n\r\n{$from}\r\n";
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"to\"\r\n\r\n{$to}\r\n";
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"subject\"\r\n\r\n{$subject}\r\n";
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\n{$bodyText}\r\n";
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"html\"\r\n\r\n{$bodyHtml}\r\n";
        if ($pdfPath !== null && is_file($pdfPath)) {
            $pdfContent = file_get_contents($pdfPath);
            $body .= "--{$boundary}\r\n";
            $body .= "Content-Disposition: form-data; name=\"attachment\"; filename=\"" . basename($pdfFilename) . "\"\r\n";
            $body .= "Content-Type: application/pdf\r\n\r\n";
            $body .= $pdfContent . "\r\n";
        }
        $body .= "--{$boundary}--\r\n";

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: multipart/form-data; boundary={$boundary}\r\nAuthorization: Basic " . base64_encode("api:{$apiKey}") . "\r\n",
                'content' => $body,
                'timeout' => 30,
            ]
        ]);
        $url = 'https://api.mailgun.net/v3/' . preg_replace('/[^a-z0-9.-]/', '', $domain) . '/messages';
        $resp = @file_get_contents($url, false, $ctx);
        $code = (int)(isset($http_response_header[0]) ? preg_replace('/\D/', '', explode(' ', $http_response_header[0])[1] ?? 0) : 0);
        if ($code >= 200 && $code < 300) {
            return ['ok' => true];
        }
        $err = 'Mailgun rechazó el envío.';
        if ($resp !== false) {
            $j = json_decode($resp, true);
            if (isset($j['message'])) {
                $err = $j['message'];
            }
        }
        return ['ok' => false, 'error' => $err];
    }
}
