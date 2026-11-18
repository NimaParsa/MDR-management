const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function hashToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

function createAuthMiddleware(db) {
    return async function authenticate(req, res, next) {
        try {
            const authHeader = req.headers.authorization || '';
            const authParts = authHeader.trim().split(/\s+/);
            const [scheme, token] = authParts;

            if (
                authParts.length !== 2 ||
                scheme.toLowerCase() !== 'bearer' ||
                !token
            ) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required.'
                });
            }

            if (!process.env.JWT_SECRET) {
                console.error('JWT_SECRET is not configured.');
                return res.status(500).json({
                    success: false,
                    message: 'Authentication service is not configured.'
                });
            }

            const payload = jwt.verify(token, process.env.JWT_SECRET, {
                algorithms: ['HS256'],
                issuer: 'mdr-management'
            });
            const tokenHash = hashToken(token);

            const [rows] = await db.execute(
                `SELECT
                    u.id,
                    u.full_name,
                    u.email,
                    u.is_active
                 FROM user_sessions s
                 INNER JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ?
                   AND s.expires_at > UTC_TIMESTAMP()
                 LIMIT 1`,
                [tokenHash]
            );

            if (rows.length === 0 || Number(rows[0].is_active) !== 1) {
                return res.status(401).json({
                    success: false,
                    message: 'Session is invalid or expired.'
                });
            }

            if (String(rows[0].id) !== String(payload.sub)) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid authentication token.'
                });
            }

            req.user = {
                id: rows[0].id,
                fullName: rows[0].full_name,
                email: rows[0].email
            };

            req.authTokenHash = tokenHash;
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError' ||
                error.name === 'TokenExpiredError' ||
                error.name === 'NotBeforeError') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired authentication token.'
                });
            }

            console.error('Authentication service error:', error.message);
            return res.status(503).json({
                success: false,
                message: 'Authentication service temporarily unavailable.'
            });
        }
    };
}

module.exports = createAuthMiddleware;
