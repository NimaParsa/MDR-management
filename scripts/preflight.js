const fs = require('fs');
const path = require('path');

let failed = false;

function pass(message) {
    console.log(`PASS  ${message}`);
}

function warn(message) {
    console.warn(`WARN  ${message}`);
}

function fail(message) {
    failed = true;
    console.error(`FAIL  ${message}`);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (Number.isInteger(nodeMajor) && nodeMajor >= 22) {
    pass(`Node.js ${process.versions.node}`);
} else {
    fail(`Node.js 22 or newer is required (detected ${process.versions.node}).`);
}

const requiredVariables = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET'
];

for (const name of requiredVariables) {
    if (typeof process.env[name] === 'string' && process.env[name].trim()) {
        pass(`${name} is configured (value hidden)`);
    } else {
        fail(`${name} is missing or empty.`);
    }
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warn('JWT_SECRET is shorter than 32 characters; consider replacing it with a longer random secret during a planned session reset.');
}

for (const name of ['DB_PORT', 'PORT']) {
    const value = process.env[name];
    if (value === undefined || value === '') continue;

    const port = Number(value);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        pass(`${name} has a valid port number`);
    } else {
        fail(`${name} must be an integer between 1 and 65535.`);
    }
}

const configuredOrigins = (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

for (const origin of configuredOrigins) {
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.origin !== origin) {
            fail(`FRONTEND_ORIGINS contains a non-canonical or non-HTTPS origin: ${origin}`);
        } else {
            pass(`Allowed frontend origin: ${origin}`);
        }
    } catch {
        fail(`FRONTEND_ORIGINS contains an invalid origin: ${origin}`);
    }
}

if (configuredOrigins.length === 0) {
    pass('FRONTEND_ORIGINS is empty; same-origin deployment mode is selected');
}

const frontendIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
if (fs.existsSync(frontendIndex)) {
    pass('Frontend production build is present');
} else {
    warn('frontend/dist/index.html is absent; the app will run in API-only mode');
}

if (failed) {
    console.error('\nPreflight failed. Correct the items above before starting the application.');
    process.exitCode = 1;
} else {
    console.log('\nPreflight passed. This checks runtime configuration only; it does not test database connectivity.');
}
