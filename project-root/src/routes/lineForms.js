// project-root/src/routes/lineForms.js
import express from 'express';
import dayjs from 'dayjs';
import 'dayjs/locale/th.js';

import { listVendors } from '../services/procurement/vendorService.js';
import { createRequisition, getRequisitionById } from '../services/procurement/prService.js';
import { approvePrAndCreatePo } from '../services/procurement/workflowService.js';
import { rejectRequisition } from '../services/procurement/prService.js';
import { PR_STATUSES, STATUS_LABELS } from '../services/procurement/constants.js';

dayjs.locale('th');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.noChrome = true;
  next();
});

function parseNumber(input, fallback = 0) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  if (typeof input !== 'string') return fallback;
  const normalized = input.replace(/[^\d,.-]/g, '').replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

router.get('/forms/quick-pr', async (req, res, next) => {
  try {
    const vendors = await listVendors({ activeOnly: true });
    res.render('line/quick_pr', {
      title: 'Quick PR',
      vendors,
      dayjs,
      result: null,
      form: {
        requester: '',
        vendorId: req.query.vendorId || '',
        notes: '',
        line1Desc: '',
        line1Qty: '',
        line1Price: '',
        line2Desc: '',
        line2Qty: '',
        line2Price: '',
      },
      errors: [],
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forms/quick-pr', async (req, res, next) => {
  try {
    const vendors = await listVendors({ activeOnly: true });
    const requester = (req.body.requester || '').trim() || 'LINE User';
    const vendorId = req.body.vendorId || '';

    const lines = [];
    if (req.body.line1Desc) {
      lines.push({
        description: req.body.line1Desc.trim(),
        quantity: parseNumber(req.body.line1Qty, 1),
        unitPrice: parseNumber(req.body.line1Price, 0),
        uom: req.body.line1Uom || 'EA',
      });
    }
    if (req.body.line2Desc) {
      lines.push({
        description: req.body.line2Desc.trim(),
        quantity: parseNumber(req.body.line2Qty, 1),
        unitPrice: parseNumber(req.body.line2Price, 0),
        uom: req.body.line2Uom || 'EA',
      });
    }

    const errors = [];
    if (!vendorId) errors.push('เลือกผู้ขายก่อนส่งคำขอ');
    if (!lines.length) errors.push('กรอกอย่างน้อย 1 รายการ');

    if (errors.length) {
      return res.render('line/quick_pr', {
        title: 'Quick PR',
        vendors,
        dayjs,
        result: null,
        errors,
        form: { ...req.body },
      });
    }

    const pr = await createRequisition(
      {
        requester,
        vendorId,
        lines: lines.map((line) => ({
          ...line,
          amount: Number((line.quantity * line.unitPrice).toFixed(2)),
        })),
        taxRate: 0,
        taxAmount: 0,
        total: lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
        notes: req.body.notes || 'สร้างผ่าน quick form',
      },
      'line-quick-form'
    );

    res.render('line/quick_pr', {
      title: 'Quick PR',
      vendors,
      dayjs,
      form: { requester: '', vendorId: '', notes: '', line1Desc: '', line1Qty: '', line1Price: '', line2Desc: '', line2Qty: '', line2Price: '' },
      errors: [],
      result: { success: true, pr },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/approve/pr/:id', async (req, res, next) => {
  try {
    const pr = await getRequisitionById(req.params.id);
    if (!pr) {
      return res.status(404).render('line/quick_pr_approve', {
        title: 'PR Not Found',
        pr: null,
        error: 'ไม่พบเอกสาร',
        STATUS_LABELS,
        PR_STATUSES,
        dayjs,
      });
    }
    res.render('line/quick_pr_approve', {
      title: pr.prNumber,
      pr,
      STATUS_LABELS,
      PR_STATUSES,
      dayjs,
      message: req.query.msg || '',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/approve/pr/:id', async (req, res, next) => {
  try {
    const action = req.body.action;
    if (action === 'approve') {
      await approvePrAndCreatePo(req.params.id, 'line-approver', {
        remark: req.body.remark || 'Approved via LINE quick action',
        paymentTerms: 'Credit 30 days',
        incoterms: 'FOB',
      });
      return res.redirect(`/line/approve/pr/${req.params.id}?msg=approved`);
    }
    if (action === 'reject') {
      await rejectRequisition(req.params.id, 'line-approver', req.body.reason || 'Rejected via LINE quick action');
      return res.redirect(`/line/approve/pr/${req.params.id}?msg=rejected`);
    }
    return res.redirect(`/line/approve/pr/${req.params.id}?msg=unknown`);
  } catch (err) {
    next(err);
  }
});

export default router;
