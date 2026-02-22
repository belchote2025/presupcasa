-- Añadir columnas de facturas recurrentes a la tabla invoices
-- Ejecutar en phpMyAdmin sobre tu base de datos de producción

-- Si alguna columna ya existe, MySQL dará error "Duplicate column";
-- en ese caso puedes ignorar esa línea o comentarla.

ALTER TABLE invoices
  ADD COLUMN is_recurring TINYINT(1) DEFAULT 0,
  ADD COLUMN recurrence_frequency VARCHAR(20) NULL,
  ADD COLUMN next_date DATE NULL;
