CREATE DATABASE IF NOT EXISTS inventory_reconciliation;
USE inventory_reconciliation;

CREATE TABLE IF NOT EXISTS imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) NOT NULL,
  mobilier_filename VARCHAR(255) NOT NULL,
  lecteur_filename VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_batch (batch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) NOT NULL,
  bt_inv2024 VARCHAR(100) NULL,
  designation_affect TEXT NULL,
  direction VARCHAR(255) NULL,
  code_invest VARCHAR(100) NOT NULL,
  designation VARCHAR(255) NULL,
  specification TEXT NULL,
  original_etat VARCHAR(100) NULL,
  reader_etat VARCHAR(100) NULL,
  reader_bt VARCHAR(100) NULL,
  reader_date DATETIME NULL,
  result_status ENUM('DONE','DEPLACE','NON_TROUVE') NOT NULL DEFAULT 'NON_TROUVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_batch (batch_id),
  KEY idx_inventory_code (batch_id, code_invest)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reader_scans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) NOT NULL,
  barcode VARCHAR(100) NOT NULL,
  etat VARCHAR(100) NULL,
  affect VARCHAR(100) NULL,
  date_heure_entree DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reader_batch (batch_id),
  KEY idx_reader_barcode (batch_id, barcode),
  KEY idx_reader_date (batch_id, barcode, date_heure_entree)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comparison_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) NOT NULL,
  inventory_item_id BIGINT UNSIGNED NOT NULL,
  reader_scan_id BIGINT UNSIGNED NULL,
  database_bt VARCHAR(100) NULL,
  reader_bt VARCHAR(100) NULL,
  result_status ENUM('DONE','DEPLACE','NON_TROUVE') NOT NULL,
  compared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comparison_item (batch_id, inventory_item_id),
  KEY idx_comparison_batch (batch_id),
  CONSTRAINT fk_comparison_inventory FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_comparison_reader FOREIGN KEY (reader_scan_id) REFERENCES reader_scans(id) ON DELETE SET NULL
) ENGINE=InnoDB;
