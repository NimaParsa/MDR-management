'use strict';

const express = require('express');
const { calculateProjectMetrics, effectiveWeight } = require('../lib/mdr-metrics');

const STATUSES = new Set([
    'Not Started', 'In Progress', 'IFA', 'IFR', 'IFC',
    'Approved', 'On Hold', 'Cancelled'
]);

module.exports = function createDocumentManagementRouter(db, authenticate, requirePermission) {
    const router = express.Router();
    router.use(authenticate);

    function positiveId(value) {
        if (!/^[1-9]\d*$/.test(String(value || ''))) return null;
        const n = Number(value);
        return Number.isSafeInteger(n) ? n : null;
    }

    function text(value, max, field, required = false) {
        if (value === undefined || value === null) {
            if (required) throw new Error(`${field} is required.`);
            return null;
        }
        const result = String(value).trim();
        if (required && !result) throw new Error(`${field} is required.`);
        if (result.length > max) throw new Error(`${field} is too long.`);
        return result || null;
    }

    function number(value, field, fallback, min, max = Number.MAX_SAFE_INTEGER) {
        if (value === undefined || value === null || value === '') return fallback;
        const result = Number(value);
        if (!Number.isFinite(result) || result < min || result > max) {
            throw new Error(`${field} must be between ${min} and ${max}.`);
        }
        return result;
    }

    function date(value, field) {
        if (value === undefined || value === null || value === '') return null;
        const s = String(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${field} must use YYYY-MM-DD format.`);
        const d = new Date(`${s}T00:00:00Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
            throw new Error(`${field} is not a valid date.`);
        }
        return s;
    }

    function normalize(body, mode) {
        const docNo = text(body.document_no ?? body.docNo, 160, 'Document number', true);
        const title = text(body.title, 500, 'Document title', true);
        const documentType = text(body.document_type ?? body.docType ?? 'Other', 100, 'Document type', true);
        const disciplineId = positiveId(body.discipline_id);
        if (!disciplineId) throw new Error('A valid discipline is required.');
        const weight = number(body.weight_factor ?? body.weight, 'Weight factor', 1.0001, 0.0001, 999999.9999);
        const manhours = number(body.manhours ?? body.mh, 'Planned manhours', 0, 0, 999999999);
        const rate = number(body.manhour_rate ?? body.rate, 'Hourly rate', 3, 0, 999999999);
        const progress = number(body.progress_percent ?? body.progress, 'Progress', 0, 0, 100);
        const status = text(body.document_status ?? body.status ?? 'Not Started', 40, 'Status', true);
        if (!STATUSES.has(status)) throw new Error('Unsupported document status.');
        return {
            document_no: docNo,
            title,
            document_type: documentType,
            discipline_id: disciplineId,
            weight_factor_manual: mode === 'manual' ? weight : null,
            legacy_weight_factor: mode === 'manual' ? null : weight,
            manhours,
            manhour_rate: rate,
            progress_percent: progress,
            document_status: status,
            planned_issue_date: date(body.planned_issue_date ?? body.plannedDate, 'Planned issue date'),
            actual_issue_date: date(body.actual_issue_date ?? body.actualDate, 'Actual issue date'),
            revision_code: text(body.revision_code ?? body.revision, 40, 'Revision'),
            remarks: text(body.remarks, 5000, 'Remarks')
        };
    }

    async function projectSettings(projectId) {
        const [rows] = await db.execute(
            'SELECT id, weight_factor_mode, currency_code FROM projects WHERE id = ? LIMIT 1',
            [projectId]
        );
        return rows[0] || null;
    }

    async function validateDiscipline(projectId, disciplineId) {
        const [rows] = await db.execute(
            'SELECT id FROM disciplines WHERE id = ? AND project_id = ? AND is_active = 1 LIMIT 1',
            [disciplineId, projectId]
        );
        return rows.length > 0;
    }

    async function loadAllDocuments(projectId) {
        const [rows] = await db.execute(`
            SELECT d.id, d.discipline_id, di.discipline_key, di.discipline_name,
                   d.legacy_id, d.document_no, d.title, d.document_type,
                   d.weight_factor_manual, d.legacy_weight_factor,
                   d.manhours, d.manhour_rate, d.progress_percent,
                   d.document_status, d.planned_issue_date, d.actual_issue_date,
                   d.revision_code, d.remarks, d.created_at, d.updated_at
            FROM documents d
            LEFT JOIN disciplines di ON di.id = d.discipline_id AND di.project_id = d.project_id
            WHERE d.project_id = ?
            ORDER BY di.display_order, di.discipline_name, d.document_no, d.id
        `, [projectId]);
        return rows;
    }

    async function audit(connection, req, projectId, action, entityId, details) {
        await connection.execute(`
            INSERT INTO audit_logs (project_id, user_id, action_key, entity_type, entity_id, details_json, ip_address)
            VALUES (?, ?, ?, 'document', ?, ?, ?)
        `, [projectId, req.user.id, action, entityId || null, JSON.stringify(details || {}), req.ip || null]);
    }

    // Full MDR and weighted / financial summary used by the operational dashboard.
    router.get('/:projectId/mdr-summary', requirePermission('documents.view'), async (req, res) => {
        const projectId = positiveId(req.params.projectId);
        try {
            const project = await projectSettings(projectId);
            if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
            const documents = await loadAllDocuments(projectId);
            const data = documents.map(d => ({
                ...d,
                effective_weight_factor: effectiveWeight(d, project.weight_factor_mode),
                weight_factor_manual: d.weight_factor_manual === null ? null : Number(d.weight_factor_manual),
                legacy_weight_factor: d.legacy_weight_factor === null ? null : Number(d.legacy_weight_factor),
                manhours: Number(d.manhours),
                manhour_rate: Number(d.manhour_rate),
                progress_percent: Number(d.progress_percent)
            }));
            return res.json({
                success: true,
                project: { id: projectId, currency_code: project.currency_code, weight_factor_mode: project.weight_factor_mode },
                data,
                metrics: calculateProjectMetrics(data, project.weight_factor_mode)
            });
        } catch (error) {
            console.error('MDR summary error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to calculate MDR summary.' });
        }
    });

    // Create a document.
    router.post('/:projectId/documents', requirePermission('documents.create'), async (req, res) => {
        const projectId = positiveId(req.params.projectId);
        let connection;
        try {
            const project = await projectSettings(projectId);
            if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
            const document = normalize(req.body || {}, project.weight_factor_mode);
            if (!(await validateDiscipline(projectId, document.discipline_id))) {
                return res.status(400).json({ success: false, message: 'Discipline does not belong to this project.' });
            }
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [result] = await connection.execute(`
                INSERT INTO documents
                    (project_id, discipline_id, document_no, title, document_type,
                     weight_factor_manual, legacy_weight_factor, manhours, manhour_rate,
                     progress_percent, document_status, planned_issue_date, actual_issue_date,
                     revision_code, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [projectId, document.discipline_id, document.document_no, document.title,
                document.document_type, document.weight_factor_manual, document.legacy_weight_factor,
                document.manhours, document.manhour_rate, document.progress_percent,
                document.document_status, document.planned_issue_date, document.actual_issue_date,
                document.revision_code, document.remarks]);
            await audit(connection, req, projectId, 'document.created', result.insertId, { document_no: document.document_no });
            await connection.commit();
            return res.status(201).json({ success: true, id: result.insertId, message: 'Document created.' });
        } catch (error) {
            if (connection) await connection.rollback();
            if (error.message && /required|too long|must be|Unsupported|valid discipline/i.test(error.message)) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Document number already exists in this project.' });
            console.error('Create document error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to create document.' });
        } finally {
            if (connection) connection.release();
        }
    });

    // Update a document.
    router.patch('/:projectId/documents/:documentId', requirePermission('documents.update'), async (req, res) => {
        const projectId = positiveId(req.params.projectId);
        const documentId = positiveId(req.params.documentId);
        let connection;
        try {
            if (!documentId) return res.status(400).json({ success: false, message: 'Invalid document ID.' });
            const project = await projectSettings(projectId);
            if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
            const document = normalize(req.body || {}, project.weight_factor_mode);
            if (!(await validateDiscipline(projectId, document.discipline_id))) {
                return res.status(400).json({ success: false, message: 'Discipline does not belong to this project.' });
            }
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [result] = await connection.execute(`
                UPDATE documents SET discipline_id = ?, document_no = ?, title = ?, document_type = ?,
                    weight_factor_manual = ?, legacy_weight_factor = ?, manhours = ?, manhour_rate = ?,
                    progress_percent = ?, document_status = ?, planned_issue_date = ?, actual_issue_date = ?,
                    revision_code = ?, remarks = ?
                WHERE id = ? AND project_id = ?
            `, [document.discipline_id, document.document_no, document.title, document.document_type,
                document.weight_factor_manual, document.legacy_weight_factor, document.manhours,
                document.manhour_rate, document.progress_percent, document.document_status,
                document.planned_issue_date, document.actual_issue_date, document.revision_code,
                document.remarks, documentId, projectId]);
            if (!result.affectedRows) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Document not found.' });
            }
            await audit(connection, req, projectId, 'document.updated', documentId, { document_no: document.document_no });
            await connection.commit();
            return res.json({ success: true, message: 'Document updated.' });
        } catch (error) {
            if (connection) await connection.rollback();
            if (error.message && /required|too long|must be|Unsupported|valid discipline/i.test(error.message)) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Document number already exists in this project.' });
            console.error('Update document error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to update document.' });
        } finally {
            if (connection) connection.release();
        }
    });

    // Delete is blocked when the document is part of a transmittal.
    router.delete('/:projectId/documents/:documentId', requirePermission('documents.delete'), async (req, res) => {
        const projectId = positiveId(req.params.projectId);
        const documentId = positiveId(req.params.documentId);
        let connection;
        try {
            if (!documentId) return res.status(400).json({ success: false, message: 'Invalid document ID.' });
            connection = await db.getConnection();
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                'SELECT id, document_no FROM documents WHERE id = ? AND project_id = ? FOR UPDATE',
                [documentId, projectId]
            );
            if (!rows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Document not found.' });
            }
            const [linked] = await connection.execute(`
                SELECT COUNT(*) AS total FROM transmittal_documents td
                INNER JOIN transmittals t ON t.id = td.transmittal_id
                WHERE td.document_id = ? AND t.project_id = ?
            `, [documentId, projectId]);
            if (Number(linked[0].total) > 0) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'This document is included in a transmittal and cannot be deleted.' });
            }
            await connection.execute('DELETE FROM documents WHERE id = ? AND project_id = ?', [documentId, projectId]);
            await audit(connection, req, projectId, 'document.deleted', documentId, { document_no: rows[0].document_no });
            await connection.commit();
            return res.json({ success: true, message: 'Document deleted.' });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('Delete document error:', error.message);
            return res.status(500).json({ success: false, message: 'Unable to delete document.' });
        } finally {
            if (connection) connection.release();
        }
    });

    return router;
};
