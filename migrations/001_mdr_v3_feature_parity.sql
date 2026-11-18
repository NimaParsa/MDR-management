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

-- Preserve the original V3 fixed discipline catalogue for every existing project.
INSERT IGNORE INTO disciplines (project_id, discipline_key, discipline_name, display_order, is_active)
SELECT p.id, d.discipline_key, d.discipline_name, d.display_order, 1
FROM projects p
CROSS JOIN (
    SELECT 'process' AS discipline_key, 'Process' AS discipline_name, 1 AS display_order
    UNION ALL SELECT 'mechanical', 'Mechanical', 2
    UNION ALL SELECT 'piping', 'Piping', 3
    UNION ALL SELECT 'civil-structural', 'Civil & Structural', 4
    UNION ALL SELECT 'electrical', 'Electrical', 5
    UNION ALL SELECT 'instrumentation-control', 'Instrumentation & Control', 6
    UNION ALL SELECT 'pipeline', 'Pipeline', 7
    UNION ALL SELECT 'hse', 'HSE', 8
    UNION ALL SELECT 'telecom', 'Telecom', 9
    UNION ALL SELECT 'hvac', 'HVAC', 10
    UNION ALL SELECT 'architecture', 'Architecture', 11
    UNION ALL SELECT 'project-engineering', 'Project Engineering', 12
    UNION ALL SELECT 'other', 'Other', 13
) AS d;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS period_from DATE NULL,
  ADD COLUMN IF NOT EXISTS period_to DATE NULL,
  ADD COLUMN IF NOT EXISTS invoice_basis ENUM('earned','full') NOT NULL DEFAULT 'earned',
  ADD COLUMN IF NOT EXISTS claim_basis_amount DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_amount DECIMAL(18,4) NOT NULL DEFAULT 0;
