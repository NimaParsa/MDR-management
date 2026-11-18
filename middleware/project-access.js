function createProjectAccess(db) {
    function requirePermission(permission, paramName = 'projectId') {
        return async function projectPermissionMiddleware(req, res, next) {
            const rawProjectId = req.params[paramName];

            if (!/^[1-9]\d*$/.test(String(rawProjectId || ''))) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid project ID.'
                });
            }

            const projectId = Number(rawProjectId);

            if (!Number.isSafeInteger(projectId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid project ID.'
                });
            }

            try {
                const [rows] = await db.execute(
                    `SELECT
                        r.role_key,
                        p.permission_key
                     FROM project_users pu
                     INNER JOIN roles r ON r.id = pu.role_id
                     LEFT JOIN role_permissions rp ON rp.role_id = r.id
                     LEFT JOIN permissions p ON p.id = rp.permission_id
                     WHERE pu.project_id = ?
                       AND pu.user_id = ?`,
                    [projectId, req.user.id]
                );

                if (rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Project not found.'
                    });
                }

                const permissions = rows
                    .map(row => row.permission_key)
                    .filter(Boolean);

                if (!permissions.includes(permission)) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to access this resource.'
                    });
                }

                req.projectAccess = {
                    projectId,
                    roleKey: rows[0].role_key,
                    permissions
                };

                next();
            } catch (error) {
                console.error('Project permission error:', error.message);

                return res.status(500).json({
                    success: false,
                    message: 'Unable to verify project permissions.'
                });
            }
        };
    }

    return { requirePermission };
}

module.exports = createProjectAccess;
