'use strict';

function finiteNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function effectiveWeight(document, mode = 'automatic') {
    const manual = document.weight_factor_manual;
    const legacy = document.legacy_weight_factor;
    const selected = mode === 'manual' ? manual : legacy;
    return Math.max(0, finiteNumber(selected, finiteNumber(legacy, 1.0001)));
}

function calculateProjectMetrics(documents, weightMode = 'automatic') {
    const groups = new Map();
    let totalWeight = 0;
    let plannedManhours = 0;
    let contractValue = 0;
    let earnedValue = 0;
    let weightedProgress = 0;

    for (const document of documents) {
        const discipline = String(document.discipline_name || document.discipline || 'Unassigned');
        const weight = effectiveWeight(document, weightMode);
        const manhours = Math.max(0, finiteNumber(document.manhours ?? document.mh));
        const rate = Math.max(0, finiteNumber(document.manhour_rate ?? document.rate, 3));
        const progress = clamp(finiteNumber(document.progress_percent ?? document.progress), 0, 100);
        const cost = manhours * rate;
        const earned = cost * progress / 100;

        totalWeight += weight;
        plannedManhours += manhours;
        contractValue += cost;
        earnedValue += earned;
        weightedProgress += weight * progress;

        if (!groups.has(discipline)) {
            groups.set(discipline, {
                discipline,
                documents: 0,
                totalWeight: 0,
                plannedManhours: 0,
                contractValue: 0,
                earnedValue: 0,
                weightedProgress: 0
            });
        }

        const group = groups.get(discipline);
        group.documents += 1;
        group.totalWeight += weight;
        group.plannedManhours += manhours;
        group.contractValue += cost;
        group.earnedValue += earned;
        group.weightedProgress += weight * progress;
    }

    const disciplines = [...groups.values()].map(group => ({
        ...group,
        weightShare: totalWeight > 0 ? group.totalWeight / totalWeight * 100 : 0,
        progress: group.totalWeight > 0 ? group.weightedProgress / group.totalWeight : 0,
        remainingValue: group.contractValue - group.earnedValue
    }));

    return {
        documentCount: documents.length,
        totalWeight,
        plannedManhours,
        contractValue,
        earnedValue,
        remainingValue: contractValue - earnedValue,
        weightedProgress: totalWeight > 0 ? weightedProgress / totalWeight : 0,
        earnedValuePercent: contractValue > 0 ? earnedValue / contractValue * 100 : 0,
        disciplines
    };
}

function calculateInvoice(documents, options = {}) {
    const basis = options.invoiceBasis === 'full' ? 'full' : 'earned';
    const vatPercent = Math.max(0, finiteNumber(options.vatPercent));
    const previouslyInvoiced = Math.max(0, finiteNumber(options.previouslyInvoiced));
    const lines = documents.map(document => {
        const manhours = Math.max(0, finiteNumber(document.manhours ?? document.mh));
        const rate = Math.max(0, finiteNumber(document.manhour_rate ?? document.rate, 3));
        const progress = clamp(finiteNumber(document.progress_percent ?? document.progress), 0, 100);
        const contractAmount = manhours * rate;
        const earnedAmount = contractAmount * progress / 100;
        return {
            documentId: document.id ?? null,
            documentNo: document.document_no ?? document.docNo ?? null,
            title: document.title ?? null,
            discipline: document.discipline_name ?? document.discipline ?? null,
            weightFactor: finiteNumber(document.effective_weight_factor ?? document.weight_factor_manual ?? document.legacy_weight_factor ?? document.weight),
            manhours,
            rate,
            progress,
            contractAmount,
            earnedAmount,
            claimAmount: basis === 'full' ? contractAmount : earnedAmount
        };
    });

    const earnedToDate = lines.reduce((sum, line) => sum + line.earnedAmount, 0);
    const claimBasisAmount = lines.reduce((sum, line) => sum + line.claimAmount, 0);
    const amountDue = Math.max(0, claimBasisAmount - previouslyInvoiced);
    const vatAmount = amountDue * vatPercent / 100;

    return {
        invoiceBasis: basis,
        earnedToDate,
        claimBasisAmount,
        previouslyInvoiced,
        amountDue,
        vatPercent,
        vatAmount,
        grossAmount: amountDue + vatAmount,
        lines
    };
}

module.exports = {
    calculateInvoice,
    calculateProjectMetrics,
    effectiveWeight
};
