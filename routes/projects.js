const express = require('express');

module.exports = function createProjectsRouter(db, authenticate, requirePermission) {
    const router = express.Router();

    // All project endpoints require authentication.
    router.use(authenticate);

    // GET /api/projects
    // Return only projects assigned to the current user
    // with projects.view permission.
    router.get('/', async (req, res) => {
        try {
            const [rows] = await db.execute(`
                SELECT
                    p.id,
                    p.project_code,
                    p.project_name,
                    p.client_name,
                    p.weight_factor_mode,
                    p.currency_code
                FROM projects p
                WHERE EXISTS (
                    SELECT 1
                    FROM project_users pu
                    INNER JOIN role_permissions rp
                        ON rp.role_id = pu.role_id
                    INNER JOIN permissions pe
                        ON pe.id = rp.permission_id
                    WHERE pu.project_id = p.id
                      AND pu.user_id = ?
                      AND pe.permission_key = 'projects.view'
                )
                ORDER BY p.project_name ASC
            `, [req.user.id]);

            return res.json({
                success: true,
                count: rows.length,
                data: rows
            });
        } catch (error) {
            console.error('Projects list error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Unable to retrieve projects'
            });
        }
    });

    // GET /api/projects/:id
    // Require project membership and projects.view permission.
    router.get('/:id', requirePermission('projects.view', 'id'), async (req, res) => {
        const projectId = Number(req.params.id);

        try {
            const [rows] = await db.execute(`
                SELECT
                    id,
                    project_code,
                    project_name,
                    client_name,
                    weight_factor_mode,
                    currency_code
                FROM projects
                WHERE id = ?
                LIMIT 1
            `, [projectId]);

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            return res.json({
                success: true,
                data: rows[0]
            });
        } catch (error) {
            console.error('Project detail error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Unable to retrieve project'
            });
        }
    });

    return router;
};
