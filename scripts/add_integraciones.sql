-- Migración: columnas para Email, Pagos, Idioma, Backup y Firma
-- Ejecutar UNA VEZ en la BD. Si alguna columna ya existe, ignorar el error de esa línea.

-- Config: email de envío y nombre remitente
ALTER TABLE company_settings ADD COLUMN sender_name VARCHAR(255) NULL DEFAULT NULL AFTER vendomia_api_key;
ALTER TABLE company_settings ADD COLUMN document_language VARCHAR(10) NULL DEFAULT 'es' AFTER sender_name;

-- Config: pago (enlace manual o futuro API)
ALTER TABLE company_settings ADD COLUMN payment_link_url VARCHAR(500) NULL DEFAULT NULL AFTER document_language;
ALTER TABLE company_settings ADD COLUMN payment_enabled TINYINT(1) NULL DEFAULT 0 AFTER payment_link_url;

-- Config: backup por email
ALTER TABLE company_settings ADD COLUMN backup_email VARCHAR(255) NULL DEFAULT NULL AFTER payment_enabled;

-- Firma del cliente en presupuesto (base64 de la imagen)
ALTER TABLE quotes ADD COLUMN quote_signature TEXT NULL DEFAULT NULL AFTER notes;
