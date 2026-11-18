const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const createAuthMiddleware = require('../middleware/auth');

const secret = 'test-only-secret-for-auth-middleware';

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

function createToken(options = {}) {
    return jwt.sign(
        {},
        secret,
        {
            subject: '7',
            issuer: 'mdr-management',
            expiresIn: '5m',
            algorithm: 'HS256',
            ...options
        }
    );
}

test('rejects requests without a Bearer token', async () => {
    process.env.JWT_SECRET = secret;
    const middleware = createAuthMiddleware({
        async execute() {
            assert.fail('Database must not be queried without a token');
        }
    });
    const req = { headers: {} };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test('rejects a token signed with an algorithm other than HS256', async () => {
    process.env.JWT_SECRET = secret;
    const token = createToken({ algorithm: 'HS512' });
    const middleware = createAuthMiddleware({
        async execute() {
            assert.fail('Database must not be queried for a rejected token');
        }
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test('accepts a valid token backed by an active database session', async () => {
    process.env.JWT_SECRET = secret;
    const token = createToken();
    let queriedSql = '';
    let queriedParams;

    const middleware = createAuthMiddleware({
        async execute(sql, params) {
            queriedSql = sql;
            queriedParams = params;
            return [[{
                id: 7,
                full_name: 'Test User',
                email: 'test@example.invalid',
                is_active: 1
            }]];
        }
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.match(queriedSql, /s\.token_hash = \?/);
    assert.match(queriedSql, /s\.expires_at > UTC_TIMESTAMP\(\)/);
    assert.equal(typeof queriedParams[0], 'string');
    assert.equal(queriedParams[0].length, 64);
    assert.deepEqual(req.user, {
        id: 7,
        fullName: 'Test User',
        email: 'test@example.invalid'
    });
    assert.equal(req.authTokenHash, queriedParams[0]);
});

test('rejects a valid JWT without a matching active session', async () => {
    process.env.JWT_SECRET = secret;
    const token = createToken();
    const middleware = createAuthMiddleware({
        async execute() {
            return [[]];
        }
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test('rejects a session belonging to a disabled user', async () => {
    process.env.JWT_SECRET = secret;
    const token = createToken();
    const middleware = createAuthMiddleware({
        async execute() {
            return [[{
                id: 7,
                full_name: 'Disabled User',
                email: 'disabled@example.invalid',
                is_active: 0
            }]];
        }
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
});

test('returns 503 when the session database query fails', async () => {
    process.env.JWT_SECRET = secret;
    const token = createToken();
    const middleware = createAuthMiddleware({
        async execute() {
            throw new Error('simulated database failure');
        }
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 503);
    assert.equal(nextCalled, false);
});
