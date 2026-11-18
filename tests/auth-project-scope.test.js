const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createAuthRouter = require('../routes/auth');

async function requestMe(router) {
    const app = express();
    app.use('/api/auth', router);
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`);
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

test('current-user project list only includes roles with projects.view', async () => {
    let queryCount = 0;
    const db = {
        async execute(sql, params) {
            queryCount += 1;

            if (queryCount === 1) {
                assert.deepEqual(params, [7]);
                assert.match(sql, /EXISTS\s*\(/);
                assert.match(sql, /pe\.permission_key = 'projects\.view'/);
                return [[{
                    id: 12,
                    project_code: 'MDR-12',
                    project_name: 'Test Project',
                    client_name: 'Test Client',
                    currency_code: 'USD',
                    role_key: 'viewer',
                    role_name: 'Viewer'
                }]];
            }

            assert.equal(queryCount, 2);
            assert.match(sql, /role_permissions/);
            assert.deepEqual(params, [7, 12]);
            return [[{ project_id: 12, permission_key: 'projects.view' }]];
        }
    };

    const authenticate = (req, res, next) => {
        req.user = { id: 7, fullName: 'Test User', email: 'test@example.invalid' };
        next();
    };

    const response = await requestMe(createAuthRouter(db, authenticate));

    assert.equal(response.status, 200);
    assert.equal(response.body.projects.length, 1);
    assert.equal(response.body.projects[0].id, 12);
    assert.deepEqual(response.body.projects[0].permissions, ['projects.view']);
    assert.equal(queryCount, 2);
});
