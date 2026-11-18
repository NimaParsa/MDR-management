function createCorsMiddleware(configuredOrigins = '') {
    const allowedOrigins = new Set(
        String(configuredOrigins || '')
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean)
    );

    return function corsMiddleware(req, res, next) {
        const origin = req.headers.origin;

        if (origin && allowedOrigins.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }

        if (req.method === 'OPTIONS') {
            if (origin && allowedOrigins.has(origin)) {
                return res.sendStatus(204);
            }

            return res.sendStatus(403);
        }

        return next();
    };
}

module.exports = createCorsMiddleware;
