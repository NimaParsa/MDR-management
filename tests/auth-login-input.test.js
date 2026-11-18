const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createAuthRouter = require('../routes/auth');

async function withAuthServer(run) {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    const calls = [];
    const db = {
        async execute(sql, params) {
            calls.push({ sql, params });
            return [[], []];
        }
    };

    app.use('/api/auth', createAuthRouter(db, (req, res, next) => next()));

    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
        const address = server.address();
        await run(`http://127.0.0.1:${address.port}`, calls);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

test('rejects an email longer than 254 characters before querying the database', async () => {
    await withAuthServer(async (baseUrl, calls) => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `${'a'.repeat(245)}@example.com`,
                password: 'valid-password'
            })
        });

        assert.equal(response.status, 400);
        assert.equal((await response.json()).message, 'Email or password exceeds the allowed length.');
        assert.equal(calls.length, 0);
    });
});

test('rejects an excessively long password before querying the database', async () => {
    await withAuthServer(async (baseUrl, calls) => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'user@example.com',
                password: 'p'.repeat(1025)
            })
        });

        assert.equal(response.status, 400);
        assert.equal((await response.json()).message, 'Email or password exceeds the allowed length.');
        assert.equal(calls.length, 0);
    });
});

test('keeps ordinary login requests on the existing authentication path', async () => {
    await withAuthServer(async (baseUrl, calls) => {
        const previousSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-only-secret';

        try {
            const response = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'user@example.com',
                    password: 'ordinary-password'
                })
            });

            assert.equal(response.status, 401);
            assert.equal((await response.json()).message, 'Invalid email or password.');
            assert.equal(calls.length, 1);
            assert.match(calls[0].sql, /FROM users/);
        } finally {
            if (previousSecret === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = previousSecret;
        }
    });
});
