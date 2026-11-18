const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createDocumentManagementRouter = require('../routes/document-management');

async function request(router, method, path, body) {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', router);
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

const authenticate = (req, res, next) => { req.user = { id: 7 }; next(); };
const permissions = (req, res, next) => {
    req.projectAccess = { projectId: Number(req.params.projectId), permissions: ['documents.view','documents.create','documents.update','documents.delete','settings.manage','invoices.view'] };
    next();
};
const requirePermission = () => permissions;

function connection(execute) {
    return {
        execute,
        async beginTransaction(){},
        async commit(){},
        async rollback(){},
        release(){}
    };
}

test('creates a project-scoped MDR document with V3 fields and defaults', async () => {
    const inserted = [];
    const conn = connection(async (sql, params) => {
        if (sql.includes('INSERT INTO documents')) { inserted.push(params); return [{ insertId: 41, affectedRows: 1 }]; }
        if (sql.includes('INSERT INTO audit_logs')) return [{ affectedRows: 1 }];
        assert.fail(`Unexpected connection SQL: ${sql}`);
    });
    const db = {
        async execute(sql, params) {
            if (sql.includes('FROM projects')) return [[{ id: 12, weight_factor_mode: 'automatic', currency_code: 'USD' }]];
            if (sql.includes('FROM disciplines')) { assert.deepEqual(params, [4,12]); return [[{ id: 4 }]]; }
            assert.fail(`Unexpected pool SQL: ${sql}`);
        },
        async getConnection(){ return conn; }
    };
    const router = createDocumentManagementRouter(db, authenticate, requirePermission);
    const result = await request(router, 'POST', '/api/projects/12/documents', {
        document_no: 'PRJ-ME-DWG-001', title: 'Pump GA Drawing', discipline_id: 4,
        document_type: 'Drawing', weight_factor: 1.0001, manhours: 20,
        manhour_rate: 3, progress_percent: 25, document_status: 'in progress',
        planned_issue_date: '2026-12-01', actual_issue_date: null, revision_code: 'A', remarks: 'Initial issue'
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.id, 41);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][0], 12);
    assert.equal(inserted[0][2], 'PRJ-ME-DWG-001');
    assert.equal(inserted[0][9], 25);
    assert.equal(inserted[0][10], 'In Progress');
    assert.equal(inserted[0][11], '2026-12-01');
    assert.equal(inserted[0][14], 'Initial issue');
});

test('rejects document progress outside 0 to 100 before writing', async () => {
    let writes = 0;
    const db = {
        async execute(sql) {
            if (sql.includes('FROM projects')) return [[{ id: 12, weight_factor_mode: 'automatic', currency_code: 'USD' }]];
            if (sql.includes('FROM disciplines')) return [[{ id: 4 }]];
            assert.fail(`Unexpected SQL: ${sql}`);
        },
        async getConnection(){ writes++; throw new Error('Should not write invalid input'); }
    };
    const router = createDocumentManagementRouter(db, authenticate, requirePermission);
    const result = await request(router, 'POST', '/api/projects/12/documents', {
        document_no: 'BAD-001', title: 'Bad progress', discipline_id: 4,
        document_type: 'Drawing', progress_percent: 120
    });
    assert.equal(result.status, 400);
    assert.equal(writes, 0);
});

test('blocks deletion of documents already included in a transmittal', async () => {
    let committed = false, rolledBack = false;
    const conn = connection(async (sql, params) => {
        if (sql.includes('SELECT id, document_no FROM documents')) { assert.deepEqual(params,[41,12]); return [[{ id:41, document_no:'DOC-41' }]]; }
        if (sql.includes('SELECT COUNT(*) AS total FROM transmittal_documents')) return [[{ total:1 }]];
        assert.fail(`Unexpected SQL: ${sql}`);
    });
    conn.commit=async()=>{committed=true;};conn.rollback=async()=>{rolledBack=true;};
    const db={async getConnection(){return conn;}};
    const router=createDocumentManagementRouter(db,authenticate,requirePermission);
    const result=await request(router,'DELETE','/api/projects/12/documents/41');
    assert.equal(result.status,409);
    assert.equal(rolledBack,true);
    assert.equal(committed,false);
});
