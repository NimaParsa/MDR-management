const express = require('express');
const { calculateInvoice, effectiveWeight } = require('../lib/mdr-metrics');

module.exports = function createInvoicesRouter(db, authenticate, requirePermission) {
    const router = express.Router();

    router.use(authenticate);

    function parsePositiveInteger(value, defaultValue) {
        if (value === undefined) return defaultValue;

        if (!/^[1-9]\d*$/.test(String(value))) {
            return null;
        }

        const number = Number(value);

        return Number.isSafeInteger(number) ? number : null;
    }

    async function projectExists(projectId) {
        const [rows] = await db.execute(
            'SELECT id FROM projects WHERE id = ? LIMIT 1',
            [projectId]
        );

        return rows.length > 0;
    }

    async function getInvoice(projectId, invoiceId) {
        const [rows] = await db.execute(`
            SELECT id, project_id
            FROM invoices
            WHERE id = ? AND project_id = ?
            LIMIT 1
        `, [invoiceId, projectId]);

        return rows.length > 0;
    }

    // GET /api/projects/:projectId/invoices
    // List invoices for a project
    router.get('/:projectId/invoices', requirePermission('invoices.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = parsePositiveInteger(req.query.limit, 50);

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
            });
        }

        if (!page || !limit || limit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters. Limit must be between 1 and 100.'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            const [countRows] = await db.execute(`
                SELECT COUNT(*) AS total
                FROM invoices
                WHERE project_id = ?
            `, [projectId]);

            const total = Number(countRows[0].total);
            const offset = (page - 1) * limit;

            if (!Number.isSafeInteger(offset)) {
                return res.status(400).json({
                    success: false,
                    message: 'Page number is too large'
                });
            }

            const [rows] = await db.execute(`
                SELECT
                    i.id,
                    i.project_id,
                    i.invoice_no,
                    i.invoice_date,
                    i.bill_to,
                    i.contractor_name,
                    i.period_from,
                    i.period_to,
                    i.invoice_basis,
                    i.claim_basis_amount,
                    i.currency_code,
                    i.earned_to_date,
                    i.previously_invoiced,
                    i.amount_due,
                    i.vat_percent,
                    i.vat_amount,
                    i.gross_amount,
                    i.status,
                    i.notes,
                    i.created_by,
                    i.created_at,
                    i.updated_at,
                    (
                        SELECT COUNT(*)
                        FROM invoice_items ii
                        WHERE ii.invoice_id = i.id
                    ) AS item_count
                FROM invoices i
                WHERE i.project_id = ?
                ORDER BY i.invoice_date DESC, i.id DESC
                LIMIT ? OFFSET ?
            `, [projectId, limit, offset]);

            res.json({
                success: true,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                },
                data: rows.map(row => ({
                    ...row,
                    item_count: Number(row.item_count)
                }))
            });
        } catch (error) {
            console.error('Invoices list API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve invoices'
            });
        }
    });

    // GET /api/projects/:projectId/invoices/:invoiceId
    // Get one invoice
    router.get('/:projectId/invoices/:invoiceId', requirePermission('invoices.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const invoiceId = parsePositiveInteger(req.params.invoiceId);

        if (!projectId || !invoiceId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID or invoice ID'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            const [rows] = await db.execute(`
                SELECT
                    id,
                    project_id,
                    invoice_no,
                    invoice_date,
                    bill_to,
                    contractor_name,
                    period_from,
                    period_to,
                    invoice_basis,
                    claim_basis_amount,
                    currency_code,
                    earned_to_date,
                    previously_invoiced,
                    amount_due,
                    vat_percent,
                    vat_amount,
                    gross_amount,
                    status,
                    notes,
                    created_by,
                    created_at,
                    updated_at
                FROM invoices
                WHERE id = ? AND project_id = ?
                LIMIT 1
            `, [invoiceId, projectId]);

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            res.json({
                success: true,
                data: rows[0]
            });
        } catch (error) {
            console.error('Invoice detail API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve invoice'
            });
        }
    });

    // GET /api/projects/:projectId/invoices/:invoiceId/items
    // Get items belonging to one invoice
    router.get('/:projectId/invoices/:invoiceId/items', requirePermission('invoices.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const invoiceId = parsePositiveInteger(req.params.invoiceId);

        if (!projectId || !invoiceId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID or invoice ID'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            if (!(await getInvoice(projectId, invoiceId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Invoice not found'
                });
            }

            const [rows] = await db.execute(`
                SELECT
                    id,
                    invoice_id,
                    document_id,
                    document_no_snapshot,
                    document_title_snapshot,
                    discipline_snapshot,
                    weight_factor_snapshot,
                    manhours_snapshot,
                    rate_snapshot,
                    progress_percent_snapshot,
                    earned_amount,
                    contract_amount,
                    claim_amount
                FROM invoice_items
                WHERE invoice_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM invoices i
                      WHERE i.id = invoice_items.invoice_id
                        AND i.project_id = ?
                  )
                ORDER BY id ASC
            `, [invoiceId, projectId]);

            res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Invoice items API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve invoice items'
            });
        }
    });


    // POST /api/projects/:projectId/invoices
    // Create an immutable invoice snapshot from the current MDR.
    router.post('/:projectId/invoices', requirePermission('invoices.manage'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const body = req.body || {};
        const invoiceNo = String(body.invoice_no || '').trim();
        const invoiceDate = body.invoice_date ? String(body.invoice_date) : null;
        const periodFrom = body.period_from ? String(body.period_from) : null;
        const periodTo = body.period_to ? String(body.period_to) : null;
        const billTo = body.bill_to === undefined ? null : String(body.bill_to).trim();
        const contractor = body.contractor_name === undefined ? null : String(body.contractor_name).trim();
        const currency = String(body.currency_code || 'USD').trim().toUpperCase();
        const basis = body.invoice_basis === 'full' ? 'full' : 'earned';
        const vatPercent = Number(body.vat_percent ?? 0);
        const previousInput = body.previously_invoiced;
        const notes = body.notes === undefined ? null : String(body.notes).trim();

        const validDate = value => value === null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
        if (!projectId || !invoiceNo || invoiceNo.length > 100 ||
            (billTo && billTo.length > 200) || (contractor && contractor.length > 200) ||
            !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100 ||
            !validDate(invoiceDate) || !validDate(periodFrom) || !validDate(periodTo) ||
            (periodFrom && periodTo && periodFrom > periodTo) ||
            (notes && notes.length > 5000)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice details.' });
        }

        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [projects] = await connection.execute(
                'SELECT id, weight_factor_mode, currency_code, previous_invoiced_amount FROM projects WHERE id = ? LIMIT 1 FOR UPDATE',
                [projectId]
            );
            if (!projects.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Project not found.' });
            }

            const project = projects[0];
            const [documents] = await connection.execute(`
                SELECT d.id, d.document_no, d.title, d.manhours, d.manhour_rate,
                       d.progress_percent, d.weight_factor_manual, d.legacy_weight_factor,
                       di.discipline_name
                FROM documents d
                LEFT JOIN disciplines di ON di.id = d.discipline_id AND di.project_id = d.project_id
                WHERE d.project_id = ?
                ORDER BY d.id ASC
                FOR UPDATE
            `, [projectId]);

            if (!documents.length) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Cannot generate an invoice because the project MDR is empty.' }); }

            const normalizedDocs = documents.map(d => ({
                ...d,
                effective_weight_factor: effectiveWeight(d, project.weight_factor_mode)
            }));
            const previouslyInvoiced = previousInput === undefined || previousInput === null || previousInput === ''
                ? Number(project.previous_invoiced_amount || 0)
                : Number(previousInput);
            if (!Number.isFinite(previouslyInvoiced) || previouslyInvoiced < 0) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Previously invoiced amount must be zero or greater.' });
            }

            const calculation = calculateInvoice(normalizedDocs, {
                invoiceBasis: basis,
                previouslyInvoiced,
                vatPercent
            });

            const [insert] = await connection.execute(`
                INSERT INTO invoices
                    (project_id, invoice_no, invoice_date, bill_to, contractor_name,
                     period_from, period_to, currency_code, earned_to_date,
                     previously_invoiced, amount_due, vat_percent, vat_amount,
                     gross_amount, invoice_basis, claim_basis_amount, status, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
            `, [projectId, invoiceNo, invoiceDate, billTo, contractor, periodFrom, periodTo,
                currency, calculation.earnedToDate, calculation.previouslyInvoiced,
                calculation.amountDue, vatPercent, calculation.vatAmount,
                calculation.grossAmount, basis, calculation.claimBasisAmount, notes, req.user.id]);

            for (const line of calculation.lines) {
                await connection.execute(`
                    INSERT INTO invoice_items
                        (invoice_id, document_id, document_no_snapshot, document_title_snapshot,
                         discipline_snapshot, weight_factor_snapshot, manhours_snapshot,
                         rate_snapshot, progress_percent_snapshot, earned_amount,
                         contract_amount, claim_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [insert.insertId, line.documentId, line.documentNo, line.title,
                    line.discipline, line.weightFactor, line.manhours, line.rate,
                    line.progress, line.earnedAmount, line.contractAmount, line.claimAmount]);
            }

            await connection.execute(`
                INSERT INTO audit_logs (project_id, user_id, action_key, entity_type, entity_id, details_json, ip_address)
                VALUES (?, ?, 'invoice.created', 'invoice', ?, ?, ?)
            `, [projectId, req.user.id, insert.insertId,
                JSON.stringify({ invoice_no: invoiceNo, invoice_basis: basis, gross_amount: calculation.grossAmount }),
                req.ip || null]);

            await connection.commit();
            return res.status(201).json({
                success: true,
                id: insert.insertId,
                calculation,
                message: 'Invoice draft created from an MDR snapshot.'
            });
        } catch (error) {
            if (connection) await connection.rollback();
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Invoice number already exists in this project.' });
            console.error('Create invoice error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to create invoice.' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};
