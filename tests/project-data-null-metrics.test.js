const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createProjectDataRouter = require('../routes/project-data');

async function requestThroughRouter(router, path) {
    const app = express();
    app.use('/api/projects', router);
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

test('document API preserves null metrics instead of converting them to zero', async () => {
    const db = {
        async execute(sql, params) {
            if (sql.includes('SELECT id FROM projects')) {
                assert.deepEqual(params, [12]);
                return [[{ id: 12 }]];
            }
            if (sql.includes('SELECT COUNT(*) AS total')) {
                return [[{ total: 1 }]];
            }
            if (sql.includes('FROM documents d') && sql.includes('LIMIT ? OFFSET ?')) {
                return [[{
                    id: 4,
                    document_no: 'DOC-004',
                    title: 'Unrated document',
                    weight_factor_manual: null,
                    legacy_weight_factor: null,
                    manhours: null,
                    manhour_rate: null,
                    progress_percent: null
                }]];
            }
            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };
    const router = createProjectDataRouter(
        db,
        (req, res, next) => next(),
        () => (req, res, next) => next()
    );
    const response = await requestThroughRouter(router, '/api/projects/12/documents');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].manhours, null);
    assert.equal(response.body.data[0].manhour_rate, null);
    assert.equal(response.body.data[0].progress_percent, null);
    assert.equal(response.body.data[0].weight_factor_manual, null);
    assert.equal(response.body.data[0].legacy_weight_factor, null);
});
