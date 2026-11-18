const test = require('node:test');
const assert = require('node:assert/strict');
const apiErrorHandler = require('../middleware/error-handler');

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

test('returns a JSON 400 response for malformed JSON bodies', () => {
    const res = createResponse();
    apiErrorHandler({ type: 'entity.parse.failed', message: 'parser detail' }, {}, res, assert.fail);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
        success: false,
        message: 'Invalid JSON request body.'
    });
});

test('returns a JSON 413 response for oversized request bodies', () => {
    const res = createResponse();
    apiErrorHandler({ type: 'entity.too.large', message: 'parser detail' }, {}, res, assert.fail);
    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.body, {
        success: false,
        message: 'Request body is too large.'
    });
});

test('does not expose unexpected internal error details', () => {
    const res = createResponse();
    apiErrorHandler(new Error('database password leaked'), {}, res, assert.fail);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        success: false,
        message: 'An unexpected server error occurred.'
    });
    assert.doesNotMatch(JSON.stringify(res.body), /database password/);
});

test('delegates when response headers have already been sent', () => {
    const res = {
        headersSent: true
    };
    const error = new Error('stream failure');
    let delegated;
    apiErrorHandler(error, {}, res, received => {
        delegated = received;
    });
    assert.equal(delegated, error);
});
