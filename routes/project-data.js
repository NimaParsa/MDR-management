const express = require('express');

module.exports = function createProjectDataRouter(db, authenticate, requirePermission) {
    const router = express.Router();

    // All project data endpoints require authentication.
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

    // GET /api/projects/:projectId/disciplines
    router.get('/:projectId/disciplines', requirePermission('documents.view'), async (req, res) => {
        const projectId = parsePositiveInteger(req.params.projectId);

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid project ID'
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
                    discipline_key,
                    discipline_name,
                    display_order,
                    is_active
                FROM disciplines
                WHERE project_id = ?
                  AND is_active = 1
                ORDER BY display_order ASC, discipline_name ASC
            `, [projectId]);

            res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Disciplines API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve disciplines'
            });
        }
    });

    // GET /api/projects/:projectId/documents
    router.get('/:projectId/documents', requirePermission('documents.view'), async (req, res) => {
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

        const discipline = req.query.discipline;
        const search = req.query.search;

        if (
            (discipline !== undefined &&
             (typeof discipline !== 'string' || discipline.length > 120)) ||
            (search !== undefined &&
             (typeof search !== 'string' || search.length > 200))
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid search or discipline parameter'
            });
        }

        try {
            if (!(await projectExists(projectId))) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            const conditions = ['d.project_id = ?'];
            const params = [projectId];

            if (discipline && discipline.trim()) {
                conditions.push(
                    '(di.discipline_key = ? OR di.discipline_name = ?)'
                );
                params.push(discipline.trim(), discipline.trim());
            }

            if (search && search.trim()) {
                conditions.push(
                    '(d.document_no LIKE ? OR d.title LIKE ?)'
                );

                const term = `%${search.trim()}%`;
                params.push(term, term);
            }

            const whereClause = conditions.join(' AND ');

            const [countRows] = await db.execute(`
                SELECT COUNT(*) AS total
                FROM documents d
                LEFT JOIN disciplines di
                    ON di.id = d.discipline_id
                   AND di.project_id = d.project_id
                WHERE ${whereClause}
            `, params);

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
                    d.id,
                    d.discipline_id,
                    di.discipline_key,
                    di.discipline_name,
                    d.legacy_id,
                    d.document_no,
                    d.title,
                    d.document_type,
                    d.weight_factor_manual,
                    d.legacy_weight_factor,
                    d.manhours,
                    d.manhour_rate,
                    d.progress_percent,
                    d.document_status,
                    d.planned_issue_date,
                    d.actual_issue_date,
                    d.revision_code,
                    d.remarks,
                    d.created_at,
                    d.updated_at
                FROM documents d
                LEFT JOIN disciplines di
                    ON di.id = d.discipline_id
                   AND di.project_id = d.project_id
                WHERE ${whereClause}
                ORDER BY d.document_no ASC, d.id ASC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);

            const data = rows.map(row => ({
                ...row,
                weight_factor_manual:
                    row.weight_factor_manual === null
                        ? null : Number(row.weight_factor_manual),
                legacy_weight_factor:
                    row.legacy_weight_factor === null
                        ? null : Number(row.legacy_weight_factor),
                manhours: row.manhours === null ? null : Number(row.manhours),
                manhour_rate: row.manhour_rate === null ? null : Number(row.manhour_rate),
                progress_percent: row.progress_percent === null ? null : Number(row.progress_percent),
                document_status: row.document_status,
                planned_issue_date: row.planned_issue_date,
                actual_issue_date: row.actual_issue_date,
                revision_code: row.revision_code,
                remarks: row.remarks
            }));

            res.json({
                success: true,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                },
                filters: {
                    discipline: discipline || null,
                    search: search || null
                },
                data
            });
        } catch (error) {
            console.error('Documents API error:', error.message);

            res.status(500).json({
                success: false,
                message: 'Unable to retrieve documents'
            });
        }
    });

    return router;
};
