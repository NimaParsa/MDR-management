-- MDR V3 parity migration
-- Target: MariaDB 11.4+
-- Apply only after confirming the selected database and taking a fresh backup.
-- This file is intentionally not executed by application startup.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_status VARCHAR(40) NOT NULL DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS planned_issue_date DATE NULL,
  ADD COLUMN IF NOT EXISTS actual_issue_date DATE NULL,
  ADD COLUMN IF NOT EXISTS revision_code VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS remarks TEXT NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS period_from DATE NULL,
  ADD COLUMN IF NOT EXISTS period_to DATE NULL,
  ADD COLUMN IF NOT EXISTS invoice_basis ENUM('earned','full') NOT NULL DEFAULT 'earned',
  ADD COLUMN IF NOT EXISTS claim_basis_amount DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_amount DECIMAL(18,4) NOT NULL DEFAULT 0;
