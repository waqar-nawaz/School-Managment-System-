-- ==========================================================
-- School Management System - MySQL initialization
-- Runs automatically the first time the MySQL volume is created.
-- The `school_db` database is created by the MYSQL_DATABASE env
-- variable; tables are managed by Sequelize (backend auto-sync).
-- ==========================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Ensure utf8mb4 defaults for new tables
SET GLOBAL character_set_server = utf8mb4;
SET GLOBAL collation_server = utf8mb4_unicode_ci;

USE school_db;

-- Audit log table is intentionally created here to guarantee it
-- exists before the API boots (audit writes are fire-and-forget).
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId BIGINT UNSIGNED NULL,
  role VARCHAR(50) NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(120) NULL,
  entityId VARCHAR(64) NULL,
  ip VARCHAR(45) NULL,
  userAgent VARCHAR(255) NULL,
  oldData JSON NULL,
  newData JSON NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (userId),
  KEY idx_audit_action (action),
  KEY idx_audit_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;