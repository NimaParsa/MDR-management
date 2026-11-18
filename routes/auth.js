const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');

function hashToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

function createAuthRouter(db, authenticate) {
    const router = express.Router();

    // Limit failed login attempts per client IP.
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: {
            success: false,
            message: 'Too many login attempts. Please try again later.'
        }
    });

    // Login
    router.post('/login', loginLimiter, async (req, res) => {
        try {
            const email = String(req.body.email || '').trim().toLowerCase();
            const password = req.body.password;

            if (!email || typeof password !== 'string' || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and password are required.'
                });
            }

            if (!process.env.JWT_SECRET) {
                console.error('JWT_SECRET is not configured.');
                return res.status(500).json({
                    success: false,
                    message: 'Authentication service is not configured.'
                });
            }

            const [users] = await db.execute(
                `SELECT id, full_name, email, password_hash, is_active
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,
                [email]
            );

            if (
                users.length === 0 ||
                Number(users[0].is_active) !== 1
            ) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            const user = users[0];
            const passwordMatches = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatches) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            const token = jwt.sign(
                {},
                process.env.JWT_SECRET,
                {
                    subject: String(user.id),
                    expiresIn: '8h',
                    issuer: 'mdr-management'
                }
            );

            const tokenHash = hashToken(token);

            await db.execute(
                `INSERT INTO user_sessions
                    (user_id, token_hash, expires_at)
                 VALUES
                    (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))`,
                [user.id, tokenHash]
            );

            await db.execute(
                'UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?',
                [user.id]
            );

            const [projects] = await db.execute(
                `SELECT
                    p.id,
                    p.project_code,
                    p.project_name,
                    p.client_name,
                    p.currency_code,
                    r.role_key,
                    r.role_name
                 FROM project_users pu
                 INNER JOIN projects p ON p.id = pu.project_id
                 INNER JOIN roles r ON r.id = pu.role_id
                 WHERE pu.user_id = ?
                 ORDER BY p.project_name`,
                [user.id]
            );

            const projectIds = projects.map(project => project.id);

            let permissionRows = [];

            if (projectIds.length > 0) {
                const placeholders = projectIds.map(() => '?').join(',');

                const [rows] = await db.execute(
                    `SELECT
                        pu.project_id,
                        pe.permission_key
                     FROM project_users pu
                     INNER JOIN role_permissions rp ON rp.role_id = pu.role_id
                     INNER JOIN permissions pe ON pe.id = rp.permission_id
                     WHERE pu.user_id = ?
                       AND pu.project_id IN (${placeholders})
                     ORDER BY pu.project_id, pe.permission_key`,
                    [user.id, ...projectIds]
                );

                permissionRows = rows;
            }

            const projectsWithPermissions = projects.map(project => ({
                ...project,
                permissions: permissionRows
                    .filter(row => String(row.project_id) === String(project.id))
                    .map(row => row.permission_key)
            }));

            return res.status(200).json({
                success: true,
                message: 'Login successful.',
                token,
                token_type: 'Bearer',
                expires_in: 28800,
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    email: user.email
                },
                projects: projectsWithPermissions
            });
        } catch (error) {
            console.error('Login error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Login failed due to a server error.'
            });
        }
    });

    // Current authenticated user
    router.get('/me', authenticate, async (req, res) => {
        try {
            const [projects] = await db.execute(
                `SELECT
                    p.id,
                    p.project_code,
                    p.project_name,
                    p.client_name,
                    p.currency_code,
                    r.role_key,
                    r.role_name
                 FROM project_users pu
                 INNER JOIN projects p ON p.id = pu.project_id
                 INNER JOIN roles r ON r.id = pu.role_id
                 WHERE pu.user_id = ?
                 ORDER BY p.project_name`,
                [req.user.id]
            );

            const projectIds = projects.map(project => project.id);
            let permissionRows = [];

            if (projectIds.length > 0) {
                const placeholders = projectIds.map(() => '?').join(',');

                const [rows] = await db.execute(
                    `SELECT pu.project_id, pe.permission_key
                     FROM project_users pu
                     INNER JOIN role_permissions rp ON rp.role_id = pu.role_id
                     INNER JOIN permissions pe ON pe.id = rp.permission_id
                     WHERE pu.user_id = ?
                       AND pu.project_id IN (${placeholders})
                     ORDER BY pu.project_id, pe.permission_key`,
                    [req.user.id, ...projectIds]
                );

                permissionRows = rows;
            }

            return res.json({
                success: true,
                user: req.user,
                projects: projects.map(project => ({
                    ...project,
                    permissions: permissionRows
                        .filter(row => String(row.project_id) === String(project.id))
                        .map(row => row.permission_key)
                }))
            });
        } catch (error) {
            console.error('User profile error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Could not load user profile.'
            });
        }
    });

    // Logout
    router.post('/logout', authenticate, async (req, res) => {
        try {
            await db.execute(
                'DELETE FROM user_sessions WHERE token_hash = ?',
                [req.authTokenHash]
            );

            return res.json({
                success: true,
                message: 'Logout successful.'
            });
        } catch (error) {
            console.error('Logout error:', error.message);

            return res.status(500).json({
                success: false,
                message: 'Logout failed.'
            });
        }
    });

    return router;
}

module.exports = createAuthRouter;
