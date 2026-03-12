<?php
/**
 * Envío de correo SMTP para PRESUP (Gmail y otros).
 * Un solo archivo, sin dependencias. From = cuenta SMTP para evitar rechazos de Gmail.
 */
class PresupMailer
{
    private $host;
    private $port;
    private $user;
    private $pass;
    private $secure;
    private $fromEmail;
    private $replyTo;
    private $timeout = 30;

    public function __construct(array $config)
    {
        $this->host = trim($config['host'] ?? '');
        $this->port = (int)($config['port'] ?? 587);
        $this->user = trim($config['user'] ?? '');
        $this->pass = preg_replace('/\s+/', '', (string)($config['pass'] ?? ''));
        $this->secure = strtolower(trim($config['secure'] ?? 'tls'));
        $this->fromEmail = strtolower(trim($config['from_email'] ?? $this->user));
        $this->replyTo = trim($config['reply_to'] ?? $this->fromEmail);
    }

    /**
     * Envía un correo con cuerpo en texto y opcional adjunto PDF.
     * @param string $to Email destinatario
     * @param string $subject Asunto
     * @param string $bodyTexto Cuerpo en texto plano
     * @param string|null $pdfPath Ruta al archivo PDF, o null
     * @param string $pdfFilename Nombre del archivo para el adjunto
     * @return array ['ok' => bool, 'error' => string]
     */
    public function send($to, $subject, $bodyTexto, $pdfPath = null, $pdfFilename = 'documento.pdf')
    {
        if ($this->host === '' || $this->user === '') {
            return ['ok' => false, 'error' => 'Faltan servidor o usuario SMTP.'];
        }

        $boundaryMixed = 'presup_' . bin2hex(random_bytes(8));
        $boundaryAlt = 'presup_alt_' . bin2hex(random_bytes(8));
        $subjectEnc = $this->encodeSubject($subject);
        $bodyTexto = $bodyTexto ?: 'Adjunto encontrará el documento.';
        $bodyHtml = $this->textToHtml($bodyTexto);
        $headers = "Date: " . gmdate('D, d M Y H:i:s O') . "\r\n";
        $headers .= "Message-ID: <" . bin2hex(random_bytes(8)) . "." . time() . "@presup>\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/mixed; boundary=\"{$boundaryMixed}\"\r\n";
        $headers .= "From: " . $this->formatAddress($this->fromEmail) . "\r\n";
        $headers .= "Reply-To: " . $this->formatAddress($this->replyTo) . "\r\n";

        $body = "--{$boundaryMixed}\r\n";
        $body .= "Content-Type: multipart/alternative; boundary=\"{$boundaryAlt}\"\r\n\r\n";
        $body .= "--{$boundaryAlt}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyTexto), 76, "\r\n") . "\r\n";
        $body .= "--{$boundaryAlt}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($bodyHtml), 76, "\r\n") . "\r\n";
        $body .= "--{$boundaryAlt}--\r\n\r\n";

        if ($pdfPath !== null && is_file($pdfPath)) {
            $pdfContent = file_get_contents($pdfPath);
            $body .= "--{$boundaryMixed}\r\n";
            $body .= "Content-Type: application/pdf; name=\"" . basename($pdfFilename) . "\"\r\n";
            $body .= "Content-Transfer-Encoding: base64\r\n";
            $body .= "Content-Disposition: attachment; filename=\"" . basename($pdfFilename) . "\"\r\n\r\n";
            $body .= chunk_split(base64_encode($pdfContent), 76, "\r\n") . "\r\n";
        }

        $body .= "--{$boundaryMixed}--\r\n";
        $rawMessage = $headers . "\r\n" . $body;

        $attempts = [];
        if (stripos($this->host, 'gmail') !== false && $this->port === 587) {
            $attempts[] = ['port' => 465, 'secure' => 'ssl'];
        }
        $attempts[] = ['port' => $this->port, 'secure' => $this->secure];

        foreach ($attempts as $a) {
            $result = $this->sendRaw($to, $subjectEnc, $rawMessage, $a['port'], $a['secure']);
            if ($result['ok']) {
                return $result;
            }
        }
        return ['ok' => false, 'error' => $result['error'] ?? 'No se pudo enviar por SMTP.'];
    }

    private function textToHtml($text)
    {
        $safe = htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $withBr = nl2br($safe, false);
        return '<div style="font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px;">' . $withBr . '</div>';
    }

    private function formatAddress($email)
    {
        return '<' . $email . '>';
    }

    private function encodeSubject($s)
    {
        if (preg_match('/[^\x20-\x7E]/', $s)) {
            return '=?UTF-8?B?' . base64_encode($s) . '?=';
        }
        return $s;
    }

    private function sendRaw($to, $subject, $rawMessage, $port, $secure)
    {
        $errno = 0;
        $errstr = '';
        if ($secure === 'ssl' && $port === 465) {
            $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
            $fp = @stream_socket_client("ssl://{$this->host}:{$port}", $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $ctx);
        } else {
            $fp = @stream_socket_client("tcp://{$this->host}:{$port}", $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT);
        }
        if (!$fp) {
            return ['ok' => false, 'error' => "No se pudo conectar (puerto {$port})."];
        }

        stream_set_timeout($fp, 45);
        $read = function () use ($fp) {
            $line = '';
            while (($str = @fgets($fp, 8192)) !== false) {
                $line .= $str;
                if (strlen($str) < 4 || $str[3] !== '-') {
                    break;
                }
            }
            return $line;
        };
        $code = function ($line) {
            return (int) substr(trim($line), 0, 3);
        };
        $send = function ($cmd) use ($fp, $read, $code) {
            if (@fwrite($fp, $cmd . "\r\n") === false) {
                return 0;
            }
            return $code($read());
        };

        if ($code($read()) !== 220) {
            fclose($fp);
            return ['ok' => false, 'error' => 'Servidor no respondió.'];
        }

        $send("EHLO " . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        if ($secure === 'tls' && ($port === 587 || $port === 25)) {
            if ($send("STARTTLS") !== 220) {
                fclose($fp);
                return ['ok' => false, 'error' => 'STARTTLS no disponible.'];
            }
            $tls = defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT : STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (!@stream_socket_enable_crypto($fp, true, $tls)) {
                fclose($fp);
                return ['ok' => false, 'error' => 'TLS falló.'];
            }
            $send("EHLO " . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
        }

        if ($send("AUTH LOGIN") !== 334) {
            fclose($fp);
            return ['ok' => false, 'error' => 'AUTH no aceptado.'];
        }
        if ($send(base64_encode($this->user)) !== 334) {
            fclose($fp);
            return ['ok' => false, 'error' => 'Usuario no aceptado.'];
        }
        if ($send(base64_encode($this->pass)) !== 235) {
            fclose($fp);
            return ['ok' => false, 'error' => 'Contraseña incorrecta. Para Gmail usa contraseña de aplicación.'];
        }

        if ($send("MAIL FROM:<" . $this->fromEmail . ">") !== 250) {
            fclose($fp);
            return ['ok' => false, 'error' => 'Remitente no aceptado.'];
        }
        $c = $send("RCPT TO:<" . $to . ">");
        if ($c !== 250 && $c !== 251) {
            fclose($fp);
            return ['ok' => false, 'error' => 'Destinatario no aceptado.'];
        }
        if ($send("DATA") !== 354) {
            fclose($fp);
            return ['ok' => false, 'error' => 'DATA no aceptado.'];
        }

        $data = "To: <" . $to . ">\r\nSubject: " . $subject . "\r\n" . $rawMessage . "\r\n.\r\n";
        $data = preg_replace('/^\./m', '..', $data);
        @fwrite($fp, $data);
        $line = $read();
        @fwrite($fp, "QUIT\r\n");
        fclose($fp);

        if ($code($line) === 250) {
            return ['ok' => true];
        }
        $err = trim(preg_replace('/\s+/', ' ', (string)$line));
        return ['ok' => false, 'error' => $err !== '' ? $err : 'Mensaje rechazado por el servidor (sin respuesta del servidor).'];
    }
}
