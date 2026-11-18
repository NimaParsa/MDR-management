const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const createProjectsRouter = require('./routes/projects');
const createProjectDataRouter = require('./routes/project-data');
const createDocumentManagementRouter = require('./routes/document-management');
const createTransmittalsRouter = require('./routes/transmittals');
const createInvoicesRouter = require('./routes/invoices');
const createAuthMiddleware = require('./middleware/auth');
const createAuthRouter = require('./routes/auth');
const createUsersRouter = require('./routes/users');
const createProjectAccess = require('./middleware/project-access');
const createCorsMiddleware = require('./middleware/cors');
const app = express();

app.disable('x-powered-by');
app.use(helmet());

// Optional, exact-origin CORS allowlist for a separately hosted frontend.
// Leave FRONTEND_ORIGINS empty when the frontend is served from the same origin.
app.use(createCorsMiddleware(process.env.FRONTEND_ORIGINS));

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
app.use('/api/users', createUsersRouter(db, authenticate));

// Main route: serve the React application when a frontend build exists.
// Keep the lightweight JSON response for API-only deployments.
app.get('/', (req, res) => {
    if (hasFrontendBuild) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
    }

    return res.json({
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
app.use('/api/projects', createDocumentManagementRouter(db, authenticate, requirePermission));
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
