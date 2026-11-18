const express = require('express');

module.exports = function createTransmittalsRouter(db, authenticate, requirePermission) {
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

    async function getTransmittal(projectId, transmittalId) {
        const [rows] = await db.execute(`
            SELECT id, project_id
            FROM transmittals
            WHERE id = ? AND project_id = ?
            LIMIT 1
        `, [transmittalId, projectId]);

        return rows.length > 0;
    }

    // GET /api/projects/:projectId/transmittals
    // List transmittals for a project
    router.get('/:projectId/transmittals', requirePermission('transmittals.view'), async (req, res) => {
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
                FROM transmittals
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
                    t.id,
                    t.project_id,
                    t.legacy_seq,
                    t.transmittal_no,
                    t.transmittal_date,
                    t.recipient,
                    t.sender,
                    t.attention_to,
                    t.purpose,
                    t.project_label,
                    t.discipline_label,
                    t.remarks,
                    t.prepared_by,
                    t.created_at,
                    t.updated_at,
                    COUNT(td.id) AS document_count
                FROM transmittals t
                LEFT JOIN transmittal_documents td
                    ON td.transmittal_id = t.id
                WHERE t.project_id = ?
                GROUP BY
                    t.id,
                    t.project_id,
                    t.legacy_seq,
                    t.transmittal_no,
                    t.transmittal_date,
                    t.recipient,
                    t.sender,
                    t.attention_to,
                    t.purpose,
                    t.project_label,
                    t.discipline_label,
                    t.remarks,
                    t.prepared_by,
                    t.created_at,
                    t.updated_at
                ORDER BY
                    t.transmittal_date DESC,
                    t.id DESC
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
                    document_count: Number(row.document_count)
                }))
            });
        } catch (error) {
            console.error('Transmittals list API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve transmittals'
            });
        }
    });

    // GET /api/projects/:projectId/transmittals/:transmittalId
    // Get one transmittal
    router.get('/:projectId/transmittals/:transmittalId', requirePermission('transmittals.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const transmittalId = parsePositiveInteger(req.params.transmittalId);

        if (!projectId || !transmittalId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID or transmittal ID'
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
                    legacy_seq,
                    transmittal_no,
                    transmittal_date,
                    recipient,
                    sender,
                    attention_to,
                    purpose,
                    project_label,
                    discipline_label,
                    remarks,
                    prepared_by,
                    sections_json,
                    revision_map_json,
                    created_by,
                    created_at,
                    updated_at
                FROM transmittals
                WHERE id = ? AND project_id = ?
                LIMIT 1
            `, [transmittalId, projectId]);

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Transmittal not found'
                });
            }

            res.json({
                success: true,
                data: rows[0]
            });
        } catch (error) {
            console.error('Transmittal detail API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve transmittal'
            });
        }
    });

    // GET /api/projects/:projectId/transmittals/:transmittalId/documents
    // Get documents linked to a transmittal
    router.get('/:projectId/transmittals/:transmittalId/documents', requirePermission('transmittals.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const transmittalId = parsePositiveInteger(req.params.transmittalId);

        if (!projectId || !transmittalId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID or transmittal ID'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            if (!(await getTransmittal(projectId, transmittalId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Transmittal not found'
                });
            }

            const [rows] = await db.execute(`
                SELECT
                    td.id AS transmittal_document_id,
                    td.transmittal_id,
                    td.document_id,
                    td.revision_code,
                    td.display_order,
                    d.document_no,
                    d.title,
                    d.document_type,
                    d.discipline_id,
                    di.discipline_key,
                    di.discipline_name
                FROM transmittal_documents td
                INNER JOIN documents d
                    ON d.id = td.document_id
                LEFT JOIN disciplines di
                    ON di.id = d.discipline_id
                   AND di.project_id = d.project_id
                WHERE td.transmittal_id = ?
                  AND d.project_id = ?
                ORDER BY td.display_order ASC, td.id ASC
            `, [transmittalId, projectId]);

            res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Transmittal documents API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve transmittal documents'
            });
        }
    });

    // GET /api/projects/:projectId/transmittals/:transmittalId/revisions
    // Get revision history of a transmittal
    router.get('/:projectId/transmittals/:transmittalId/revisions', requirePermission('transmittals.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);
        const transmittalId = parsePositiveInteger(req.params.transmittalId);

        if (!projectId || !transmittalId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID or transmittal ID'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            if (!(await getTransmittal(projectId, transmittalId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Transmittal not found'
                });
            }

            const [rows] = await db.execute(`
                SELECT
                    id,
                    transmittal_id,
                    revision_code,
                    issue_code,
                    revision_date,
                    description,
                    display_order
                FROM transmittal_revisions
                WHERE transmittal_id = ?
                ORDER BY display_order ASC, id ASC
            `, [transmittalId]);

            res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Transmittal revisions API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve transmittal revisions'
            });
        }
    });

    return router;
};
