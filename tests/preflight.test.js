const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, '..', 'scripts', 'preflight.js');

function runPreflight(overrides = {}) {
    return spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        env: {
            ...process.env,
            DB_HOST: 'localhost',
            DB_NAME: 'mdr_test',
            DB_USER: 'mdr_test_user',
            DB_PASSWORD: 'test-only-password',
            JWT_SECRET: 'test-only-secret-that-is-long-enough',
            DB_PORT: '3306',
            ...overrides
        }
    });
}

test('preflight succeeds with required environment configuration and hides secret values', () => {
    const result = runPreflight({ FRONTEND_ORIGINS: 'https://dev.example.com' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DB_PASSWORD is configured \(value hidden\)/);
    assert.doesNotMatch(result.stdout + result.stderr, /test-only-password|test-only-secret/);
    assert.match(result.stdout, /Preflight passed/);
});

test('preflight fails when a required database setting is missing', () => {
    const result = runPreflight({ DB_PASSWORD: '' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /DB_PASSWORD is missing or empty/);
});

test('preflight rejects non-HTTPS or non-canonical frontend origins', () => {
    const result = runPreflight({ FRONTEND_ORIGINS: 'http://dev.example.com,https://dev.example.com/' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /non-canonical or non-HTTPS origin/);
});

test('preflight rejects invalid port values', () => {
    const result = runPreflight({ DB_PORT: '70000' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /DB_PORT must be an integer/);
});
