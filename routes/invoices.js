const express = require('express');

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
                    earned_amount
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

    return router;
};
