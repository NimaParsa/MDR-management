const express = require('express');
const mysql = require('mysql2/promise');
const createProjectsRouter = require('./routes/projects');
const createProjectDataRouter = require('./routes/project-data');
const createTransmittalsRouter = require('./routes/transmittals');
const createInvoicesRouter = require('./routes/invoices');
const createAuthMiddleware = require('./middleware/auth');
const createAuthRouter = require('./routes/auth');
const createProjectAccess = require('./middleware/project-access');
const app = express();

app.use(express.json());

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

app.use('/api/projects', createProjectsRouter(db, authenticate, requirePermission));
app.use('/api/projects', createProjectDataRouter(db, authenticate, requirePermission));
app.use('/api/projects', createTransmittalsRouter(db, authenticate, requirePermission));
app.use('/api/projects', createInvoicesRouter(db, authenticate, requirePermission));
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`MDR Backend started on port ${port}`);
});
