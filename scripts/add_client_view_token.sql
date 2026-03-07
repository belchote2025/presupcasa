-- Enlace "Mis documentos" para clientes: token de solo lectura para ver sus presupuestos/facturas.
-- Ejecutar una vez (por ejemplo desde phpMyAdmin).

ALTER TABLE customers ADD COLUMN view_token VARCHAR(64) NULL DEFAULT NULL;
CREATE UNIQUE INDEX idx_customers_view_token ON customers(view_token);
