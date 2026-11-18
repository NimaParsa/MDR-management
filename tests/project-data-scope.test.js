const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createInvoicesRouter = require('../routes/invoices');
const createTransmittalsRouter = require('../routes/transmittals');

async function requestThroughRouter(router, path) {
    const app = express();
    app.use('/api/projects', router);

    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        return {
            status: response.status,
            body: await response.json()
        };
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

function authenticate(req, res, next) {
    req.user = { id: 7 };
    next();
}

function requirePermission(expectedPermission) {
    return (req, res, next) => {
        assert.equal(expectedPermission, 'invoices.view');
        next();
    };
}

test('invoice detail lookup is constrained by both invoice and project IDs', async () => {
    const db = {
        async execute(sql, params) {
            if (sql.includes('SELECT id FROM projects')) {
                assert.deepEqual(params, [12]);
                return [[{ id: 12 }]];
            }

            if (sql.includes('FROM invoices') && sql.includes('WHERE id = ? AND project_id = ?')) {
                assert.deepEqual(params, [999, 12]);
                return [[]];
            }

            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };

    const router = createInvoicesRouter(db, authenticate, requirePermission);
    const response = await requestThroughRouter(router, '/api/projects/12/invoices/999');

    assert.equal(response.status, 404);
    assert.equal(response.body.message, 'Invoice not found');
});

test('transmittal detail lookup is constrained by both transmittal and project IDs', async () => {
    const db = {
        async execute(sql, params) {
            if (sql.includes('SELECT id FROM projects')) {
                assert.deepEqual(params, [12]);
                return [[{ id: 12 }]];
            }

            if (sql.includes('FROM transmittals') && sql.includes('WHERE id = ? AND project_id = ?')) {
                assert.deepEqual(params, [888, 12]);
                return [[]];
            }

            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };

    const router = createTransmittalsRouter(
        db,
        authenticate,
        (permission) => {
            assert.equal(permission, 'transmittals.view');
            return (req, res, next) => next();
        }
    );

    const response = await requestThroughRouter(
        router,
        '/api/projects/12/transmittals/888'
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.message, 'Transmittal not found');
});


test('invoice item query is independently constrained to the requested project', async () => {
    const db = {
        async execute(sql, params) {
            if (sql.includes('SELECT id FROM projects')) {
                assert.deepEqual(params, [12]);
                return [[{ id: 12 }]];
            }

            if (sql.includes('FROM invoices') && sql.includes('WHERE id = ? AND project_id = ?')) {
                assert.deepEqual(params, [55, 12]);
                return [[{ id: 55, project_id: 12 }]];
            }

            if (sql.includes('FROM invoice_items')) {
                assert.match(sql, /EXISTS\s*\(/);
                assert.match(sql, /i\.project_id = \?/);
                assert.deepEqual(params, [55, 12]);
                return [[{ id: 1, invoice_id: 55, earned_amount: 1250 }]];
            }

            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };

    const router = createInvoicesRouter(db, authenticate, requirePermission);
    const response = await requestThroughRouter(router, '/api/projects/12/invoices/55/items');

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].invoice_id, 55);
});

test('transmittal revision query is independently constrained to the requested project', async () => {
    const db = {
        async execute(sql, params) {
            if (sql.includes('SELECT id FROM projects')) {
                assert.deepEqual(params, [12]);
                return [[{ id: 12 }]];
            }

            if (sql.includes('FROM transmittals') && sql.includes('WHERE id = ? AND project_id = ?')) {
                assert.deepEqual(params, [88, 12]);
                return [[{ id: 88, project_id: 12 }]];
            }

            if (sql.includes('FROM transmittal_revisions')) {
                assert.match(sql, /EXISTS\s*\(/);
                assert.match(sql, /t\.project_id = \?/);
                assert.deepEqual(params, [88, 12]);
                return [[{ id: 4, transmittal_id: 88, revision_code: 'A' }]];
            }

            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };

    const router = createTransmittalsRouter(
        db,
        authenticate,
        (permission) => {
            assert.equal(permission, 'transmittals.view');
            return (req, res, next) => next();
        }
    );

    const response = await requestThroughRouter(
        router,
        '/api/projects/12/transmittals/88/revisions'
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].transmittal_id, 88);
});
