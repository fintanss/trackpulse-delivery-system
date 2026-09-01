CREATE DATABASE IF NOT EXISTS trackpulse_db;
USE trackpulse_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  role ENUM('RETAILER_STAFF', 'DISPATCHER', 'RIDER') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  retailer_id INT NOT NULL,
  dispatcher_id INT NULL,
  rider_id INT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  delivery_address TEXT NOT NULL,
  item_description TEXT NOT NULL,
  qr_verification_code VARCHAR(20) NOT NULL,
  status ENUM('CREATED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED') DEFAULT 'CREATED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (retailer_id) REFERENCES users(id),
  FOREIGN KEY (dispatcher_id) REFERENCES users(id),
  FOREIGN KEY (rider_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS delivery_status_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delivery_id INT NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by_user_id INT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

-- Seed Initial Users (Matches your current phpMyAdmin structure)
INSERT INTO users (id, full_name, phone_number, role) VALUES
(1, 'Wanjiku Electronics', '254711111111', 'RETAILER_STAFF'),
(2, 'Main Dispatcher', '254722222222', 'DISPATCHER'),
(3, 'Kevin Rider', '254733333333', 'RIDER'),
(4, 'David Og', '+254733000111', 'RIDER'),
(5, 'Grace', '+254744000222', 'RIDER')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);