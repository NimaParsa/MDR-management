const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const createProjectsRouter = require('./routes/projects');
const createProjectDataRouter = require('./routes/project-data');
const createTransmittalsRouter = require('./routes/transmittals');
const createInvoicesRouter = require('./routes/invoices');
const createAuthMiddleware = require('./middleware/auth');
const createAuthRouter = require('./routes/auth');
const createProjectAccess = require('./middleware/project-access');
const app = express();

app.disable('x-powered-by');
app.use(helmet());

// Optional, exact-origin CORS allowlist for a separately hosted frontend.
// Leave FRONTEND_ORIGINS empty when the frontend is served from the same origin.
const allowedFrontendOrigins = new Set(
    String(process.env.FRONTEND_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
);

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedFrontendOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }

    if (req.method === 'OPTIONS') {
        if (origin && allowedFrontendOrigins.has(origin)) {
            return res.sendStatus(204);
        }

        return res.sendStatus(403);
    }

    next();
});

app.use(express.json({ limit: '1mb' }));

// Serve the built React application when frontend/dist has been uploaded.
// If the build is absent, the API-only deployment behaves as before.
const frontendDist = path.join(__dirname, 'frontend', 'dist');
const hasFrontendBuild = fs.existsSync(path.join(frontendDist, 'index.html'));

if (hasFrontendBuild) {
    app.use(express.static(frontendDist));
}

// MySQL connection pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: ['DATE'],
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});


// Authentication
const authenticate = createAuthMiddleware(db);
const { requirePermission } = createProjectAccess(db);
app.use('/api/auth', createAuthRouter(db, authenticate));

// Main route
app.get('/', (req, res) => {
    res.json({
        application: 'MDR Management',
        status: 'running',
        version: '1.0.0'
    });
});

// Backend health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'MDR Backend is healthy',
        node: process.version,
        timestamp: new Date().toISOString()
    });
});

// Readiness check: confirm the API can reach its database.
app.get('/api/ready', async (req, res) => {
    try {
        await db.execute('SELECT 1 AS ready');

        return res.status(200).json({
            success: true,
            message: 'MDR Backend is ready',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Readiness check failed:', error.message);

        return res.status(503).json({
            success: false,
            message: 'MDR Backend is not ready',
            database: 'unavailable',
            timestamp: new Date().toISOString()
        });
    }
});

app.use('/api/projects', createProjectsRouter(db, authenticate, requirePermission));
app.use('/api/projects', createProjectDataRouter(db, authenticate, requirePermission));
app.use('/api/projects', createTransmittalsRouter(db, authenticate, requirePermission));
app.use('/api/projects', createInvoicesRouter(db, authenticate, requirePermission));

// React Router fallback for non-API paths when the frontend build is present.
if (hasFrontendBuild) {
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
}

// Return a consistent JSON response for unknown API routes.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found.'
    });
});

// Keep the error handler last so parser and route errors use the API format.
const apiErrorHandler = require('./middleware/error-handler');
app.use(apiErrorHandler);

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`MDR Backend started on port ${port}`);
});
