-- Pagos parciales de facturas: tabla para registrar cada pago a cuenta.
-- Ejecutar una vez en la base de datos (por ejemplo desde phpMyAdmin o mysql).

CREATE TABLE IF NOT EXISTS invoice_payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    invoice_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    INDEX idx_invoice (invoice_id)
);
