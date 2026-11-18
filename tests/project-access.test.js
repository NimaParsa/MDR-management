const test = require('node:test');
const assert = require('node:assert/strict');
const createProjectAccess = require('../middleware/project-access');

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

function createRequest(projectId = '12') {
    return {
        params: { projectId },
        user: { id: 7 }
    };
}

test('rejects malformed project IDs before querying the database', async () => {
    let queried = false;
    const db = {
        async execute() {
            queried = true;
            return [[]];
        }
    };
    const middleware = createProjectAccess(db).requirePermission('documents.view');
    const req = createRequest('12abc');
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
    assert.equal(queried, false);
});

test('returns 404 when the user is not assigned to the project', async () => {
    const db = { async execute() { return [[]]; } };
    const middleware = createProjectAccess(db).requirePermission('documents.view');
    const res = createResponse();
    let nextCalled = false;

    await middleware(createRequest(), res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 404);
    assert.equal(nextCalled, false);
});

test('returns 403 when the project role lacks the requested permission', async () => {
    const db = {
        async execute() {
            return [[{ role_key: 'viewer', permission_key: 'projects.view' }]];
        }
    };
    const middleware = createProjectAccess(db).requirePermission('documents.manage');
    const res = createResponse();
    let nextCalled = false;

    await middleware(createRequest(), res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
});

test('allows an assigned user with the requested permission', async () => {
    const db = {
        async execute(sql, params) {
            assert.match(sql, /pu\.project_id = \?/);
            assert.match(sql, /pu\.user_id = \?/);
            assert.deepEqual(params, [12, 7]);
            return [[
                { role_key: 'engineer', permission_key: 'documents.view' },
                { role_key: 'engineer', permission_key: 'transmittals.view' }
            ]];
        }
    };
    const middleware = createProjectAccess(db).requirePermission('documents.view');
    const req = createRequest();
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.projectAccess.projectId, 12);
    assert.equal(req.projectAccess.roleKey, 'engineer');
    assert.deepEqual(req.projectAccess.permissions, [
        'documents.view',
        'transmittals.view'
    ]);
});

test('returns a controlled server error when the permission query fails', async () => {
    const db = {
        async execute() {
            throw new Error('simulated database failure');
        }
    };
    const middleware = createProjectAccess(db).requirePermission('documents.view');
    const res = createResponse();
    let nextCalled = false;

    await middleware(createRequest(), res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 500);
    assert.equal(nextCalled, false);
    assert.equal(res.body.success, false);
});
