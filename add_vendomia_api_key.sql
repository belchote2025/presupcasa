-- Añadir columna para la API key de Vendomia (ejecutar UNA VEZ en la BD)
-- Documentación: https://vendomia.vendomia-docs.com/articulo/433/
-- Si la columna ya existe, ignorar el error.

ALTER TABLE company_settings
ADD COLUMN vendomia_api_key VARCHAR(255) NULL DEFAULT NULL AFTER default_tax;
