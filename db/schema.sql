CREATE DATABASE IF NOT EXISTS inventory_reconciliation;
USE inventory_reconciliation;

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username               VARCHAR(100) NOT NULL,
  recovery_email         VARCHAR(255) NULL,
  password_hash          VARCHAR(255) NOT NULL,
  recovery_code_hash     CHAR(64) NULL,
  recovery_code_expires_at DATETIME NULL,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_username (username)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Sessions
-- One session = one complete inventory operation based on one Mobilier file.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sessions (
  session_id        CHAR(36)     NOT NULL,
  user_id           BIGINT UNSIGNED NOT NULL,
  mobilier_filename VARCHAR(255) NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_users (id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lecteur Batches
-- One record per Lecteur file uploaded to a session.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lecteur_batches (
  batch_id    CHAR(36)     NOT NULL,
  session_id  CHAR(36)     NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  reader_rows INT UNSIGNED NOT NULL DEFAULT 0,
  imported_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  KEY idx_batches_session (session_id),
  CONSTRAINT fk_batch_session FOREIGN KEY (session_id) REFERENCES inventory_sessions (session_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Items
-- Current reconciled state for every item in the Mobilier, per session.
-- last_lecteur_batch_id tracks which Lecteur most recently touched each item.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id           CHAR(36)        NOT NULL,
  last_lecteur_batch_id CHAR(36)       NULL,
  bt_inv2024           VARCHAR(100)    NULL,
  designation_affect   TEXT            NULL,
  direction            VARCHAR(255)    NULL,
  code_invest          VARCHAR(100)    NOT NULL,
  designation          VARCHAR(255)    NULL,
  specification        TEXT            NULL,
  original_etat        VARCHAR(100)    NULL,
  reader_etat          VARCHAR(100)    NULL,
  reader_bt            VARCHAR(100)    NULL,
  reader_date          DATETIME        NULL,
  result_status        ENUM('Traité','Deplacé','Non_Trouvé','Nouveau') NOT NULL DEFAULT 'Non_Trouvé',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_session (session_id),
  KEY idx_inventory_code    (session_id, code_invest)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reader Scans
-- Individual barcode scans from each Lecteur file.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reader_scans (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id          CHAR(36)        NOT NULL,
  barcode           VARCHAR(100)    NOT NULL,
  etat              VARCHAR(100)    NULL,
  affect            VARCHAR(100)    NULL,
  date_heure_entree DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reader_batch   (batch_id),
  KEY idx_reader_barcode (batch_id, barcode),
  KEY idx_reader_date    (batch_id, barcode, date_heure_entree)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comparison Results
-- Current best match per inventory item, across all Lecteurs in the session.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparison_results (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id          CHAR(36)        NOT NULL,
  inventory_item_id   BIGINT UNSIGNED NOT NULL,
  reader_scan_id      BIGINT UNSIGNED NULL,
  database_bt         VARCHAR(100)    NULL,
  reader_bt           VARCHAR(100)    NULL,
  result_status       ENUM('Traité','Deplacé','Non_Trouvé','Nouveau') NOT NULL,
  compared_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comparison_item (session_id, inventory_item_id),
  KEY idx_comparison_session (session_id),
  CONSTRAINT fk_comparison_inventory FOREIGN KEY (inventory_item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_comparison_reader    FOREIGN KEY (reader_scan_id)    REFERENCES reader_scans (id)    ON DELETE SET NULL
) ENGINE=InnoDB;
