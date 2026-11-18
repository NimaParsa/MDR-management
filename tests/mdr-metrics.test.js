const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInvoice, calculateProjectMetrics, effectiveWeight } = require('../lib/mdr-metrics');

const docs = [
    { id: 1, discipline_name: 'Process', legacy_weight_factor: 2, manhours: 100, manhour_rate: 3, progress_percent: 50 },
    { id: 2, discipline_name: 'Process', legacy_weight_factor: 1, manhours: 50, manhour_rate: 4, progress_percent: 100 },
    { id: 3, discipline_name: 'Piping', legacy_weight_factor: 1, manhours: 200, manhour_rate: 3, progress_percent: 25 }
];

test('automatic and manual modes select the intended weight factor', () => {
    assert.equal(effectiveWeight({ legacy_weight_factor: 1.0001, weight_factor_manual: 4 }, 'automatic'), 1.0001);
    assert.equal(effectiveWeight({ legacy_weight_factor: 1.0001, weight_factor_manual: 4 }, 'manual'), 4);
    assert.equal(effectiveWeight({ legacy_weight_factor: null }, 'automatic'), 1.0001);
});

test('project metrics calculate weighted progress, discipline share and financial values', () => {
    const result = calculateProjectMetrics(docs);
    assert.equal(result.documentCount, 3);
    assert.equal(result.totalWeight, 4);
    assert.equal(result.plannedManhours, 350);
    assert.equal(result.contractValue, 1150);
    assert.equal(result.earnedValue, 475);
    assert.equal(result.remainingValue, 675);
    assert.equal(result.weightedProgress, 56.25);
    assert.equal(result.disciplines.find(x => x.discipline === 'Process').progress, 200 / 3);
    assert.equal(result.disciplines.find(x => x.discipline === 'Process').weightShare, 75);
});

test('earned-basis invoice subtracts previous claims before VAT', () => {
    const result = calculateInvoice(docs, { invoiceBasis: 'earned', previouslyInvoiced: 100, vatPercent: 10 });
    assert.equal(result.earnedToDate, 475);
    assert.equal(result.claimBasisAmount, 475);
    assert.equal(result.amountDue, 375);
    assert.equal(result.vatAmount, 37.5);
    assert.equal(result.grossAmount, 412.5);
});

test('full-cost invoice uses contract value and clamps amount due at zero', () => {
    const result = calculateInvoice(docs, { invoiceBasis: 'full', previouslyInvoiced: 2000, vatPercent: 0 });
    assert.equal(result.claimBasisAmount, 1150);
    assert.equal(result.amountDue, 0);
    assert.equal(result.grossAmount, 0);
});

test('zero weights and zero financial values do not produce NaN or Infinity', () => {
    const result = calculateProjectMetrics([{ discipline_name: 'Other', legacy_weight_factor: 0, manhours: 0, manhour_rate: 3, progress_percent: 80 }]);
    assert.equal(result.weightedProgress, 0);
    assert.equal(result.earnedValuePercent, 0);
    assert.equal(result.disciplines[0].progress, 0);
});
