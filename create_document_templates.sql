-- Plantillas de documento (presupuesto/factura) con líneas y notas por defecto
CREATE TABLE IF NOT EXISTS document_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type ENUM('quote','invoice') NOT NULL DEFAULT 'quote',
    notes TEXT,
    items_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name_type (name, type)
);

-- Plantillas por defecto (solo si no existen)
INSERT IGNORE INTO document_templates (name, type, notes, items_json) VALUES
('Presupuesto instalación', 'quote', 'Condiciones de pago: 50% a la firma, 50% a la entrega.\nValidez del presupuesto: 30 días.', '[{"description":"Instalación y configuración","quantity":1,"price":0,"tax":21},{"description":"Material y suministros","quantity":1,"price":0,"tax":21}]'),
('Factura de mantenimiento', 'invoice', 'Pago por transferencia. Incluye revisión y soporte según contrato.', '[{"description":"Mantenimiento mensual","quantity":1,"price":0,"tax":21}]'),
('Presupuesto reparación', 'quote', 'Diagnóstico incluido. Presupuesto sin compromiso.', '[{"description":"Diagnóstico","quantity":1,"price":0,"tax":21},{"description":"Reparación / mano de obra","quantity":1,"price":0,"tax":21},{"description":"Material / piezas","quantity":1,"price":0,"tax":21}]');
