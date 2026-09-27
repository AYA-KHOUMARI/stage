-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: upgrade from the one-shot batch model to the session model.
-- Run this script ONCE on an existing database.
-- ─────────────────────────────────────────────────────────────────────────────
USE inventory_reconciliation;

-- 1. Create inventory_sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_sessions (
  session_id        CHAR(36)        NOT NULL,
  user_id           BIGINT UNSIGNED NOT NULL,
  mobilier_filename VARCHAR(255)    NOT NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_users (id)
) ENGINE=InnoDB;

-- 2. Create lecteur_batches ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lecteur_batches (
  batch_id    CHAR(36)        NOT NULL,
  session_id  CHAR(36)        NOT NULL,
  filename    VARCHAR(255)    NOT NULL,
  reader_rows INT UNSIGNED    NOT NULL DEFAULT 0,
  imported_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_id),
  KEY idx_batches_session (session_id),
  CONSTRAINT fk_batch_session FOREIGN KEY (session_id) REFERENCES inventory_sessions (session_id)
) ENGINE=InnoDB;

-- 3. Migrate existing imports → inventory_sessions + lecteur_batches ──────────
-- Each old batch becomes its own session (owned by user id=1 as a safe default).
-- Adjust the user_id if your deployment has a specific admin user.
INSERT IGNORE INTO inventory_sessions (session_id, user_id, mobilier_filename, created_at, updated_at)
SELECT batch_id, 1, mobilier_filename, created_at, created_at
FROM imports;

INSERT IGNORE INTO lecteur_batches (batch_id, session_id, filename, imported_at)
SELECT batch_id, batch_id, lecteur_filename, created_at
FROM imports;

-- 4. Add session_id + last_lecteur_batch_id to inventory_items ────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS session_id            CHAR(36) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS last_lecteur_batch_id CHAR(36) NULL AFTER session_id,
  ADD COLUMN IF NOT EXISTS updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Copy batch_id → session_id for existing rows
UPDATE inventory_items SET session_id = batch_id WHERE session_id IS NULL;

ALTER TABLE inventory_items
  MODIFY COLUMN session_id CHAR(36) NOT NULL;

-- 5. Add session_id to comparison_results ─────────────────────────────────────
ALTER TABLE comparison_results
  ADD COLUMN IF NOT EXISTS session_id CHAR(36) NULL AFTER id;

UPDATE comparison_results SET session_id = batch_id WHERE session_id IS NULL;

ALTER TABLE comparison_results
  MODIFY COLUMN session_id CHAR(36) NOT NULL;

-- 6. Drop old batch_id columns and old imports table ──────────────────────────
-- (Comment these out if you want to keep the old columns temporarily.)
ALTER TABLE inventory_items    DROP INDEX IF EXISTS idx_inventory_batch;
ALTER TABLE inventory_items    DROP INDEX IF EXISTS idx_inventory_code;
ALTER TABLE inventory_items    ADD KEY idx_inventory_session (session_id);
ALTER TABLE inventory_items    ADD KEY idx_inventory_code (session_id, code_invest);
ALTER TABLE inventory_items    DROP COLUMN IF EXISTS batch_id;

ALTER TABLE comparison_results DROP INDEX IF EXISTS idx_comparison_batch;
ALTER TABLE comparison_results DROP INDEX IF EXISTS uq_comparison_item;
ALTER TABLE comparison_results ADD  UNIQUE KEY uq_comparison_item (session_id, inventory_item_id);
ALTER TABLE comparison_results ADD  KEY idx_comparison_session (session_id);
ALTER TABLE comparison_results DROP COLUMN IF EXISTS batch_id;

DROP TABLE IF EXISTS imports;
