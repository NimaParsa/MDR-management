const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createInvoicesRouter = require('../routes/invoices');

async function request(router, body) {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', router);
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/12/invoices`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

const authenticate=(req,res,next)=>{req.user={id:7};next();};
const requirePermission=(permission)=> (req,res,next)=>{assert.equal(permission,'invoices.manage');next();};

test('creates an invoice draft with MDR snapshot, previous claims and VAT', async () => {
    const items=[];
    const conn={
        async beginTransaction(){},async commit(){},async rollback(){},release(){},
        async execute(sql,params){
            if(sql.includes('SELECT id, weight_factor_mode, currency_code, previous_invoiced_amount FROM projects')) return [[{id:12,weight_factor_mode:'automatic',currency_code:'USD',previous_invoiced_amount:0}]];
            if(sql.includes('FROM documents d')) return [[
                {id:1,document_no:'DOC-1',title:'Pump Drawing',manhours:100,manhour_rate:3,progress_percent:50,legacy_weight_factor:2,discipline_name:'Mechanical'},
                {id:2,document_no:'DOC-2',title:'Piping Study',manhours:50,manhour_rate:4,progress_percent:100,legacy_weight_factor:1,discipline_name:'Piping'}
            ]];
            if(sql.includes('INSERT INTO invoices')) return [{insertId:88,affectedRows:1}];
            if(sql.includes('INSERT INTO invoice_items')) {items.push(params);return [{insertId:items.length,affectedRows:1}];}
            if(sql.includes('INSERT INTO audit_logs')) return [{affectedRows:1}];
            assert.fail(`Unexpected SQL: ${sql}`);
        }
    };
    const db={async getConnection(){return conn;}};
    const router=createInvoicesRouter(db,authenticate,requirePermission);
    const result=await request(router,{
        invoice_no:'INV-008',invoice_date:'2026-11-18',bill_to:'Client',contractor_name:'Engineering Co',
        currency_code:'USD',invoice_basis:'earned',previously_invoiced:50,vat_percent:10
    });
    assert.equal(result.status,201);
    assert.equal(result.body.id,88);
    assert.equal(result.body.calculation.earnedToDate,350);
    assert.equal(result.body.calculation.amountDue,300);
    assert.equal(result.body.calculation.vatAmount,30);
    assert.equal(result.body.calculation.grossAmount,330);
    assert.equal(items.length,2);
    assert.equal(items[0][10],300);
    assert.equal(items[0][11],150);
});
