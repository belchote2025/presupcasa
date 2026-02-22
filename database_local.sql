-- Script para crear la base de datos en LOCAL (XAMPP)
-- Uso: mysql -u root < database_local.sql
-- O desde phpMyAdmin: importar este archivo

CREATE DATABASE IF NOT EXISTS presunavegatel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE presunavegatel;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS company_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255),
    cif VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    default_tax DECIMAL(5,2)
);

CREATE TABLE IF NOT EXISTS customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    address TEXT,
    email VARCHAR(255),
    phone VARCHAR(20),
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog (
    id INT PRIMARY KEY AUTO_INCREMENT,
    description VARCHAR(255) NOT NULL,
    long_description TEXT,
    image_url VARCHAR(255),
    price DECIMAL(10,2) NOT NULL,
    tax DECIMAL(5,2) DEFAULT 21.00
);

CREATE TABLE IF NOT EXISTS quotes (
    id VARCHAR(50) PRIMARY KEY,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    client_name VARCHAR(255),
    client_id VARCHAR(50),
    client_address TEXT,
    client_email VARCHAR(255),
    client_phone VARCHAR(20),
    notes TEXT,
    status ENUM('draft', 'sent', 'accepted', 'rejected') DEFAULT 'draft',
    subtotal DECIMAL(10,2),
    tax_amount DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quote_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quote_id VARCHAR(50),
    description TEXT,
    image_url VARCHAR(255),
    quantity DECIMAL(10,2),
    price DECIMAL(10,2),
    tax_percent DECIMAL(5,2),
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    client_name VARCHAR(255),
    phone VARCHAR(20),
    date DATETIME,
    description TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO users (username, password, role)
SELECT 'admin', 'admin123', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

INSERT INTO company_settings (id, name, cif, email, address, default_tax)
SELECT 1, 'Mi Empresa SL', 'B12345678', 'info@miempresa.com', 'Calle Innovación 123, 28001 Madrid', 21.00
WHERE NOT EXISTS (SELECT 1 FROM company_settings WHERE id = 1);

CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY,
    quote_id VARCHAR(50),
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    client_name VARCHAR(255),
    client_id VARCHAR(50),
    client_address TEXT,
    client_email VARCHAR(255),
    client_phone VARCHAR(20),
    notes TEXT,
    status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
    subtotal DECIMAL(10,2),
    tax_amount DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    is_recurring TINYINT(1) DEFAULT 0,
    recurrence_frequency VARCHAR(20),
    next_date DATE,
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    invoice_id VARCHAR(50),
    description TEXT,
    image_url VARCHAR(255),
    quantity DECIMAL(10,2),
    price DECIMAL(10,2),
    tax_percent DECIMAL(5,2),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    client_name VARCHAR(255),
    client_id INT NULL,
    status ENUM('planning','in_progress','on_hold','completed','cancelled') DEFAULT 'planning',
    start_date DATE NULL,
    end_date DATE NULL,
    budget DECIMAL(12,2) NULL,
    user_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE NULL,
    completed TINYINT(1) DEFAULT 0,
    sort_order INT DEFAULT 0,
    assigned_to_user_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS deletion_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    table_name ENUM('quotes','invoices') NOT NULL,
    record_id VARCHAR(50) NOT NULL,
    requested_by_user_id INT NOT NULL,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    processed_by_user_id INT NULL,
    processed_at DATETIME NULL,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
