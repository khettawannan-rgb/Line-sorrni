// project-root/src/routes/procurement.js
import express from 'express';
import multer from 'multer';
import dayjs from 'dayjs';
import 'dayjs/locale/th.js';

import {
  PR_STATUSES,
  PO_STATUSES,
  STATUS_LABELS,
} from '../services/procurement/constants.js';
import {
  listRequisitions,
  createRequisition,
  getRequisitionById,
  submitForApproval,
  rejectRequisition,
  updateRequisition,
} from '../services/procurement/prService.js';
import { approvePrAndCreatePo } from '../services/procurement/workflowService.js';
import {
  listPurchaseOrders,
  createPurchaseOrder,
  approvePurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  markPdfGenerated,
} from '../services/procurement/poService.js';
import { generatePurchaseOrderPdf } from '../services/procurement/pdfService.js';
import {
  listVendors,
  getVendorById,
  ensureSeedVendors,
  createVendor,
  updateVendor,
} from '../services/procurement/vendorService.js';
import { ensureStorageDirectories, saveAttachment } from '../services/procurement/storageService.js';
import { safeNumber } from '../services/procurement/helpers.js';
import { isSuperAdminSession } from '../middleware/checkSuperAdmin.js';

dayjs.locale('th');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const PAGE_SIZE = 10;
const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : ''; // updated to use BASE_URL

ensureStorageDirectories();

router.use((req, res, next) => {
  res.locals.procurementNav = true;
  next();
});

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (isSuperAdminSession(req)) return next();
  const target = BASE_URL ? `${BASE_URL}/admin/login` : '/admin/login'; // updated to use BASE_URL
  return res.redirect(target);
}

function actorName(req) {
  return req.session?.user?.username || 'system';
}

function parseNumber(input, fallback = 0) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback;
  if (typeof input !== 'string') return fallback;
  const normalized = input.replace(/[^\d,.-]/g, '').replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function normaliseLines(body = {}) {
  const descriptions = Array.isArray(body.lineDescription) ? body.lineDescription : [body.lineDescription];
  const skus = Array.isArray(body.lineSku) ? body.lineSku : [body.lineSku];
  const qtys = Array.isArray(body.lineQuantity) ? body.lineQuantity : [body.lineQuantity];
  const uoms = Array.isArray(body.lineUom) ? body.lineUom : [body.lineUom];
  const prices = Array.isArray(body.linePrice) ? body.linePrice : [body.linePrice];
  const notes = Array.isArray(body.lineNote) ? body.lineNote : [body.lineNote];

  return descriptions
    .map((description, idx) => {
      const desc = (description || '').trim();
      if (!desc) return null;
      const quantity = parseNumber(qtys[idx], 0);
      const unitPrice = parseNumber(prices[idx], 0);
      if (quantity <= 0) return null;
      return {
        description: desc,
        sku: (skus[idx] || '').trim(),
        quantity,
        uom: (uoms[idx] || 'EA').trim() || 'EA',
        unitPrice,
        amount: Number((quantity * unitPrice).toFixed(2)),
        notes: (notes[idx] || '').trim(),
      };
    })
    .filter(Boolean);
}

function collectAttachments(files = []) {
  return files.map((file) => {
    const stored = saveAttachment(file.buffer, file.originalname);
    return {
      filename: stored.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: stored.url,
    };
  });
}

function buildPagination(totalFetched, page) {
  const hasNext = totalFetched > PAGE_SIZE;
  return {
    current: page,
    next: hasNext ? page + 1 : null,
    prev: page > 1 ? page - 1 : null,
    hasNext,
    hasPrev: page > 1,
  };
}

/* ------------------------------------------------------------------ */
/* PR Dashboard                                                        */
/* ------------------------------------------------------------------ */

router.get('/pr', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-pr';
    await ensureSeedVendors();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filters = {
      status: req.query.status || 'all',
      vendorId: req.query.vendorId || '',
      search: req.query.search || '',
    };

    const [rawPrs, vendors] = await Promise.all([
      listRequisitions(filters, { limit: PAGE_SIZE + 1, skip: (page - 1) * PAGE_SIZE }),
      listVendors({ activeOnly: true }),
    ]);

    const pagination = buildPagination(rawPrs.length, page);
    const prs = pagination.hasNext ? rawPrs.slice(0, PAGE_SIZE) : rawPrs;

    const toast = req.query.missing ? 'ไม่พบ PR ที่ร้องขอแล้ว' : null;

    res.render('procurement/pr_dashboard', {
      title: 'PR Dashboard',
      prs,
      vendors,
      filters,
      pagination,
      STATUS_LABELS,
      PR_STATUSES,
      dayjs,
      toast,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pr/new', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-pr';
    const vendors = await listVendors({ activeOnly: true });
    res.render('procurement/pr_form', {
      title: 'Create Purchase Requisition',
      vendors,
      form: {
        status: PR_STATUSES.DRAFT,
        lines: [
          { sku: '', description: '', quantity: '', uom: 'EA', unitPrice: '', notes: '' },
        ],
        taxRate: 0.07,
      },
      errors: [],
      dayjs,
      MODE: 'create',
      PR_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/pr',
  requireAuth,
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      const vendorId = req.body.vendorId || null;
      const requester = (req.body.requester || '').trim();
      const lines = normaliseLines(req.body);
      const taxRatePercent = parseNumber(req.body.taxRate, 0);
      const taxRate = Number((taxRatePercent / 100).toFixed(4));
      const taxAmount = parseNumber(req.body.taxAmount, 0);
      const subtotal = lines.reduce((sum, line) => sum + safeNumber(line.amount, 0), 0);
      const computedTax = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + (taxAmount || computedTax)).toFixed(2));

      const errors = [];
      if (!requester) errors.push('กรุณาระบุผู้ร้องขอ');
      if (!vendorId) errors.push('กรุณาเลือกผู้ขาย');
      if (!lines.length) errors.push('ต้องมีรายการสินค้าอย่างน้อย 1 รายการ');

      if (errors.length) {
        const vendors = await listVendors({ activeOnly: true });
        return res.status(400).render('procurement/pr_form', {
          title: 'Create Purchase Requisition',
          vendors,
          errors,
          dayjs,
          MODE: 'create',
          PR_STATUSES,
          form: {
            ...req.body,
            lines: lines.length ? lines : [
              { sku: '', description: '', quantity: '', uom: 'EA', unitPrice: '', notes: '' },
            ],
            taxRate,
            taxAmount: taxAmount || computedTax,
            subtotal,
            total,
          },
        });
      }

      const attachments = collectAttachments(req.files);
      const pr = await createRequisition(
        {
          requester,
          companyId: req.body.companyId || null,
          vendorId,
          currency: req.body.currency || 'THB',
          lines,
          taxRate,
          taxAmount: taxAmount || computedTax,
          total,
          notes: req.body.notes || '',
          attachments,
          approvers: [],
        },
        actorName(req)
      );

      return res.redirect(`/admin/pr/${pr._id}?created=1`);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/pr/:id', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-pr';
    const pr = await getRequisitionById(req.params.id);
    if (!pr) return res.redirect('/admin/pr?missing=1');
    const vendorId = pr.vendorId?._id || pr.vendorId || null;
    const vendor = vendorId ? await getVendorById(vendorId) : null;
    res.render('procurement/pr_detail', {
      title: `PR ${pr.prNumber}`,
      pr,
      vendor,
      STATUS_LABELS,
      PR_STATUSES,
      dayjs,
      toast: req.query.created ? 'สร้าง PR สำเร็จ' : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/pr/:id/edit', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-pr';
    const [pr, vendors] = await Promise.all([
      getRequisitionById(req.params.id),
      listVendors({ activeOnly: true }),
    ]);
    if (!pr) return res.redirect('/admin/pr?missing=1');

    res.render('procurement/pr_form', {
      title: `แก้ไข ${pr.prNumber}`,
      vendors,
      dayjs,
      MODE: 'edit',
      errors: [],
      PR_STATUSES,
      form: {
        ...pr,
        requester: pr.requester,
        vendorId: pr.vendorId?._id || pr.vendorId || '',
        taxRate: pr.taxRate,
        taxAmount: pr.taxAmount,
        subtotal: pr.subtotal,
        total: pr.total,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/pr/:id',
  requireAuth,
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      const original = await getRequisitionById(req.params.id);
      if (!original) return res.redirect('/admin/pr?missing=1');

      const vendorId = req.body.vendorId || null;
      const requester = (req.body.requester || '').trim();
      const lines = normaliseLines(req.body);
      const taxRatePercent = parseNumber(req.body.taxRate, original.taxRate * 100);
      const taxRate = Number((taxRatePercent / 100).toFixed(4));
      const taxAmount = parseNumber(req.body.taxAmount, original.taxAmount);
      const subtotal = lines.reduce((sum, line) => sum + safeNumber(line.amount, 0), 0);
      const computedTax = Number((subtotal * taxRate).toFixed(2));
      const total = Number((subtotal + (taxAmount || computedTax)).toFixed(2));
      const attachments = [...(original.attachments || []), ...collectAttachments(req.files)];

      await updateRequisition(
        req.params.id,
        {
          requester,
          vendorId,
          companyId: req.body.companyId || original.companyId,
          currency: req.body.currency || original.currency,
          lines,
          taxRate,
          taxAmount: taxAmount || computedTax,
          total,
          notes: req.body.notes || '',
          attachments,
        },
        actorName(req)
      );

      return res.redirect(`/admin/pr/${req.params.id}?updated=1`);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/pr/:id/submit', requireAuth, async (req, res, next) => {
  try {
    await submitForApproval(req.params.id, actorName(req), req.body.remark || '');
    res.redirect(`/admin/pr/${req.params.id}?submitted=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/pr/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const result = await approvePrAndCreatePo(req.params.id, actorName(req), {
      remark: req.body.remark || '',
      paymentTerms: req.body.paymentTerms || 'Credit 30 days',
      incoterms: req.body.incoterms || 'FOB',
      shipping: {
        shipTo: req.body.shipTo || '',
        address: req.body.shippingAddress || '',
        contact: req.body.shippingContact || '',
      },
    });
    const redirectTarget = result.po ? `/admin/po/${result.po._id}?from=pr&auto=1` : `/admin/pr/${req.params.id}?approved=1`;
    res.redirect(redirectTarget);
  } catch (err) {
    next(err);
  }
});

router.post('/pr/:id/reject', requireAuth, async (req, res, next) => {
  try {
    await rejectRequisition(req.params.id, actorName(req), req.body.reason || '');
    res.redirect(`/admin/pr/${req.params.id}?rejected=1`);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* PO Dashboard                                                        */
/* ------------------------------------------------------------------ */

router.get('/po', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-po';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filters = {
      status: req.query.status || 'all',
      vendorId: req.query.vendorId || '',
      search: req.query.search || '',
    };

    const [rawPos, vendors] = await Promise.all([
      listPurchaseOrders(filters, { limit: PAGE_SIZE + 1, skip: (page - 1) * PAGE_SIZE }),
      listVendors({ activeOnly: true }),
    ]);

    const pagination = buildPagination(rawPos.length, page);
    const pos = pagination.hasNext ? rawPos.slice(0, PAGE_SIZE) : rawPos;

    const toast = req.query.auto
      ? 'สร้าง PO จาก PR แล้ว'
      : req.query.missing
        ? 'ไม่พบ PO ที่ระบุ'
        : null;

    res.render('procurement/po_dashboard', {
      title: 'PO Dashboard',
      pos,
      vendors,
      filters,
      pagination,
      STATUS_LABELS,
      PO_STATUSES,
      dayjs,
      toast,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/po/new', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-po';
    const vendors = await listVendors({ activeOnly: true });
    let seed = null;
    if (req.query.fromPr) {
      const pr = await getRequisitionById(req.query.fromPr);
      if (pr) {
        seed = {
          vendorId: pr.vendorId?._id || pr.vendorId,
          lines: pr.lines,
          taxAmount: pr.taxAmount,
          subtotal: pr.subtotal,
          totalAmount: pr.total,
          currency: pr.currency,
          prId: pr._id,
        };
      }
    }

    res.render('procurement/po_form', {
      title: 'Create Purchase Order',
      vendors,
      form: seed || {
        items: [
          { description: '', quantity: '', unitPrice: '', uom: 'EA', sku: '', notes: '' },
        ],
        taxAmount: '',
        subtotal: '',
        totalAmount: '',
      },
      errors: [],
      PR_STATUSES,
      PO_STATUSES,
      dayjs,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/po', requireAuth, async (req, res, next) => {
  try {
    const lines = normaliseLines({
      lineDescription: req.body.itemDescription,
      lineSku: req.body.itemSku,
      lineQuantity: req.body.itemQuantity,
      lineUom: req.body.itemUom,
      linePrice: req.body.itemUnitPrice,
      lineNote: req.body.itemNote,
    });
    const vendorId = req.body.vendorId || '';
    const prId = req.body.prId || null;
    const subtotal = lines.reduce((sum, line) => sum + safeNumber(line.amount, 0), 0);
    const taxAmount = parseNumber(req.body.taxAmount, 0);
    const shippingFee = parseNumber(req.body.shippingFee, 0);
    const totalAmount = Number((subtotal + taxAmount + shippingFee).toFixed(2));
    const errors = [];

    if (!lines.length) errors.push('ต้องมีรายการสินค้าอย่างน้อยหนึ่งรายการ');
    if (!vendorId) errors.push('กรุณาเลือกผู้ขาย');

    if (errors.length) {
      const vendors = await listVendors({ activeOnly: true });
      return res.status(400).render('procurement/po_form', {
        title: 'Create Purchase Order',
        vendors,
        errors,
        dayjs,
        form: {
          ...req.body,
          vendorId,
          prId,
          items: lines.length
            ? lines
            : [{ description: '', quantity: '', unitPrice: '', uom: 'EA', sku: '', notes: '' }],
          subtotal,
          taxAmount,
          shippingFee,
          totalAmount,
        },
      });
    }

    const po = await createPurchaseOrder(
      {
        prId,
        vendorId,
        companyId: req.body.companyId || null,
        items: lines,
        taxAmount,
        shippingFee,
        totalAmount,
        currency: req.body.currency || 'THB',
        paymentTerms: req.body.paymentTerms || 'Credit 30 days',
        incoterms: req.body.incoterms || 'FOB',
        shipping: {
          shipTo: req.body.shipTo || '',
          address: req.body.shippingAddress || '',
          contact: req.body.shippingContact || '',
        },
        remarks: req.body.remarks || '',
      },
      actorName(req)
    );

    res.redirect(`/admin/po/${po._id}?created=1`);
  } catch (err) {
    next(err);
  }
});

router.get('/po/:id', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-po';
    const po = await getPurchaseOrderById(req.params.id);
    if (!po) return res.redirect('/admin/po?missing=1');
    const vendor = po.vendorId ? await getVendorById(po.vendorId._id || po.vendorId) : null;
    res.render('procurement/po_detail', {
      title: `PO ${po.poNumber}`,
      po,
      vendor,
      STATUS_LABELS,
      PO_STATUSES,
      dayjs,
      toast: req.query.created ? 'สร้าง PO สำเร็จ' : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/po/:id/approve', requireAuth, async (req, res, next) => {
  try {
    await approvePurchaseOrder(req.params.id, actorName(req), req.body.remark || '');
    res.redirect(`/admin/po/${req.params.id}?approved=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/po/:id/status', requireAuth, async (req, res, next) => {
  try {
    const status = req.body.status;
    await updatePurchaseOrderStatus(req.params.id, status, actorName(req), req.body.remark || '');
    res.redirect(`/admin/po/${req.params.id}?status=${status}`);
  } catch (err) {
    next(err);
  }
});

router.get('/po/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const po = await getPurchaseOrderById(req.params.id);
    if (!po) return res.redirect('/admin/po?missing=1');
    const vendor = po.vendorId ? await getVendorById(po.vendorId._id || po.vendorId) : null;
    if (!vendor) throw new Error('Vendor data is required for PDF export');

    const pdf = await generatePurchaseOrderPdf(po, vendor);
    await markPdfGenerated(po._id, pdf.pdfPath, pdf.pdfUrl);

    res.download(pdf.pdfPath, `${po.poNumber}.pdf`);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Vendor management                                                   */
/* ------------------------------------------------------------------ */

router.get('/vendors', requireAuth, async (req, res, next) => {
  try {
    res.locals.active = 'procurement-vendors';
    const vendors = await listVendors({});
    res.render('procurement/vendor_list', {
      title: 'Vendors',
      vendors,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/vendors', requireAuth, async (req, res, next) => {
  try {
    await createVendor(
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        productCategories: (req.body.productCategories || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        contact: {
          name: req.body.contactName,
          email: req.body.contactEmail,
          phone: req.body.contactPhone,
        },
        notes: req.body.notes || '',
      },
      actorName(req)
    );
    res.redirect('/admin/vendors?created=1');
  } catch (err) {
    next(err);
  }
});

router.post('/vendors/:id', requireAuth, async (req, res, next) => {
  try {
    await updateVendor(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        productCategories: (req.body.productCategories || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: req.body.notes || '',
      },
      actorName(req)
    );
    res.redirect('/admin/vendors?saved=1');
  } catch (err) {
    next(err);
  }
});

export default router;
