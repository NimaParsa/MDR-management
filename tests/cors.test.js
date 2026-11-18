const test = require('node:test');
const assert = require('node:assert/strict');
const createCorsMiddleware = require('../middleware/cors');

function createResponse() {
    return {
        headers: {},
        statusCode: null,
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        sendStatus(code) {
            this.statusCode = code;
            return this;
        }
    };
}

test('allows an exact configured origin and sets the expected CORS headers', () => {
    const middleware = createCorsMiddleware(' https://app.example.com,https://admin.example.com ');
    const req = {
        method: 'GET',
        headers: { origin: 'https://app.example.com' }
    };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.headers['access-control-allow-origin'], 'https://app.example.com');
    assert.equal(res.headers.vary, 'Origin');
    assert.equal(res.headers['access-control-allow-headers'], 'Authorization, Content-Type');
    assert.equal(res.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
});

test('does not grant CORS headers to an unconfigured origin', () => {
    const middleware = createCorsMiddleware('https://app.example.com');
    const req = {
        method: 'GET',
        headers: { origin: 'https://evil.example.net' }
    };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('accepts preflight requests from an exact configured origin', () => {
    const middleware = createCorsMiddleware('https://app.example.com');
    const req = {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' }
    };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 204);
    assert.equal(nextCalled, false);
    assert.equal(res.headers['access-control-allow-origin'], 'https://app.example.com');
});

test('rejects preflight requests from an unconfigured origin', () => {
    const middleware = createCorsMiddleware('https://app.example.com');
    const req = {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example.net' }
    };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('rejects preflight requests without an Origin header', () => {
    const middleware = createCorsMiddleware('https://app.example.com');
    const req = { method: 'OPTIONS', headers: {} };
    const res = createResponse();

    middleware(req, res, () => {
        assert.fail('A preflight request without an origin must not continue');
    });

    assert.equal(res.statusCode, 403);
});

test('keeps same-origin non-preflight requests working when the allowlist is empty', () => {
    const middleware = createCorsMiddleware('');
    const req = { method: 'GET', headers: {} };
    const res = createResponse();
    let nextCalled = false;

    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(res.headers, {});
});
