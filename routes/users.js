const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function createUsersRouter(db, authenticate) {
    const router = express.Router();
    router.use(authenticate);

    async function requireUsersManage(req, res, next) {
        try {
            const [rows] = await db.execute(`
                SELECT 1
                FROM project_users pu
                INNER JOIN role_permissions rp ON rp.role_id = pu.role_id
                INNER JOIN permissions pe ON pe.id = rp.permission_id
                WHERE pu.user_id = ?
                  AND pe.permission_key = 'users.manage'
                LIMIT 1
            `, [req.user.id]);
            if (!rows.length) {
                return res.status(403).json({ success: false, message: 'You do not have permission to manage users.' });
            }
            next();
        } catch (error) {
            console.error('User management authorization error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to verify user management permission.' });
        }
    }
    router.use(requireUsersManage);

    function positiveId(value) {
        if (!/^[1-9]\d*$/.test(String(value ?? ''))) return null;
        const n = Number(value);
        return Number.isSafeInteger(n) ? n : null;
    }
    function validateAssignments(value) {
        if (!Array.isArray(value)) return null;
        const seen = new Set();
        const result = [];
        for (const item of value) {
            const projectId = positiveId(item?.project_id);
            const roleId = positiveId(item?.role_id);
            if (!projectId || !roleId || seen.has(projectId)) return null;
            seen.add(projectId);
            result.push({ project_id: projectId, role_id: roleId });
        }
        return result;
    }
    async function assignmentsExist(connection, assignments) {
        if (!assignments.length) return true;
        const projectIds = [...new Set(assignments.map(x => x.project_id))];
        const roleIds = [...new Set(assignments.map(x => x.role_id))];
        const [projects] = await connection.execute(
            `SELECT id FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`,
            projectIds
        );
        const [roles] = await connection.execute(
            `SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`,
            roleIds
        );
        return projects.length === projectIds.length && roles.length === roleIds.length;
    }
    async function replaceAssignments(connection, userId, assignments) {
        await connection.execute('DELETE FROM project_users WHERE user_id = ?', [userId]);
        for (const assignment of assignments) {
            await connection.execute(
                'INSERT INTO project_users (project_id, user_id, role_id) VALUES (?, ?, ?)',
                [assignment.project_id, userId, assignment.role_id]
            );
        }
    }

    router.get('/meta', async (req, res) => {
        try {
            const [[projects], [roles], [permissionRows]] = await Promise.all([
                db.execute('SELECT id, project_code, project_name FROM projects ORDER BY project_name'),
                db.execute('SELECT id, role_key, role_name, description FROM roles ORDER BY id'),
                db.execute(`SELECT rp.role_id, pe.permission_key
                            FROM role_permissions rp
                            INNER JOIN permissions pe ON pe.id = rp.permission_id
                            ORDER BY rp.role_id, pe.permission_key`)
            ]);
            const rolesWithPermissions = roles.map(role => ({
                ...role,
                permissions: permissionRows
                    .filter(item => String(item.role_id) === String(role.id))
                    .map(item => item.permission_key)
            }));
            return res.json({ success: true, projects, roles: rolesWithPermissions });
        } catch (error) {
            console.error('User management metadata error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to load user management options.' });
        }
    });

    router.get('/', async (req, res) => {
        try {
            const [users] = await db.execute(`
                SELECT id, full_name, email, is_active, last_login_at, created_at
                FROM users
                ORDER BY full_name, id
            `);
            const [assignments] = await db.execute(`
                SELECT pu.user_id, pu.project_id, pu.role_id,
                       p.project_code, p.project_name, r.role_key, r.role_name
                FROM project_users pu
                INNER JOIN projects p ON p.id = pu.project_id
                INNER JOIN roles r ON r.id = pu.role_id
                ORDER BY p.project_name
            `);
            const data = users.map(user => ({
                ...user,
                is_active: Number(user.is_active) === 1,
                assignments: assignments.filter(a => String(a.user_id) === String(user.id))
            }));
            return res.json({ success: true, data });
        } catch (error) {
            console.error('Users list error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to retrieve users.' });
        }
    });

    router.post('/', async (req, res) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const fullName = String(body.full_name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = body.password;
        const assignments = validateAssignments(body.assignments);
        if (!fullName || fullName.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190 ||
            typeof password !== 'string' || password.length < 12 || password.length > 1024 || assignments === null) {
            return res.status(400).json({ success: false, message: 'Enter a valid name, email, password (at least 12 characters), and project assignments.' });
        }
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            if (!(await assignmentsExist(connection, assignments))) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'One or more selected projects or roles do not exist.' });
            }
            const [existing] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
            if (existing.length) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
            }
            const hash = await bcrypt.hash(password, 12);
            const [insert] = await connection.execute(
                'INSERT INTO users (full_name, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
                [fullName, email, hash]
            );
            await replaceAssignments(connection, insert.insertId, assignments);
            await connection.commit();
            return res.status(201).json({ success: true, message: 'User created.', id: insert.insertId });
        } catch (error) {
            if (connection) await connection.rollback().catch(() => {});
            console.error('Create user error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to create user.' });
        } finally {
            connection?.release();
        }
    });

    router.patch('/:id', async (req, res) => {
        const userId = positiveId(req.params.id);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        if (!userId) return res.status(400).json({ success: false, message: 'Invalid user ID.' });
        const fullName = String(body.full_name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const assignments = validateAssignments(body.assignments);
        const active = body.is_active;
        const password = body.password;
        if (!fullName || fullName.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190 ||
            assignments === null || typeof active !== 'boolean' ||
            (password !== undefined && (typeof password !== 'string' || password.length < 12 || password.length > 1024))) {
            return res.status(400).json({ success: false, message: 'Invalid user details, status, password, or project assignments.' });
        }
        if (userId === Number(req.user.id) && active === false) {
            return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
        }
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [target] = await connection.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
            if (!target.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'User not found.' });
            }
            if (!(await assignmentsExist(connection, assignments))) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'One or more selected projects or roles do not exist.' });
            }
            if (userId === Number(req.user.id)) {
                const adminRoleIds = assignments.map(item => item.role_id);
                let retainsManagement = false;
                if (adminRoleIds.length) {
                    const [adminRows] = await connection.execute(
                        `SELECT 1 FROM role_permissions rp
                         INNER JOIN permissions pe ON pe.id = rp.permission_id
                         WHERE rp.role_id IN (${adminRoleIds.map(() => '?').join(',')})
                           AND pe.permission_key = 'users.manage'
                         LIMIT 1`,
                        adminRoleIds
                    );
                    retainsManagement = adminRows.length > 0;
                }
                if (!retainsManagement) {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Keep at least one project assignment with user-management permission on your own account.' });
                }
            }
            const [duplicate] = await connection.execute('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [email, userId]);
            if (duplicate.length) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
            }
            if (password !== undefined) {
                const hash = await bcrypt.hash(password, 12);
                await connection.execute(
                    'UPDATE users SET full_name = ?, email = ?, is_active = ?, password_hash = ? WHERE id = ?',
                    [fullName, email, active ? 1 : 0, hash, userId]
                );
            } else {
                await connection.execute(
                    'UPDATE users SET full_name = ?, email = ?, is_active = ? WHERE id = ?',
                    [fullName, email, active ? 1 : 0, userId]
                );
            }
            await replaceAssignments(connection, userId, assignments);
            if (password !== undefined || active === false) {
                if (userId === Number(req.user.id)) {
                    await connection.execute('DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?', [userId, req.authTokenHash]);
                } else {
                    await connection.execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
                }
            }
            await connection.commit();
            return res.json({ success: true, message: 'User updated.' });
        } catch (error) {
            if (connection) await connection.rollback().catch(() => {});
            console.error('Update user error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to update user.' });
        } finally {
            connection?.release();
        }
    });

    return router;
};
