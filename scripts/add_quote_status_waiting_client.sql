-- Añade el estado "En espera de cliente" a los presupuestos.
-- Ejecutar una vez (phpMyAdmin o mysql). Si falla por "duplicate", el valor ya existe.

ALTER TABLE quotes MODIFY COLUMN status ENUM('draft', 'sent', 'waiting_client', 'accepted', 'rejected') DEFAULT 'draft';
