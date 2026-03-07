-- Días configurables para considerar una factura "impagada" en avisos y dashboard.
-- Opcional: la app crea la columna al guardar en Ajustes → Avisos. Ejecutar solo si quieres tenerla antes.

ALTER TABLE company_settings ADD COLUMN overdue_invoice_days INT DEFAULT 30;
