// project-root/src/services/procurement/poService.js
import dayjs from 'dayjs';
import PurchaseOrder from '../../models/PurchaseOrder.js';
import ProcurementAuditLog from '../../models/ProcurementAuditLog.js';

import { PO_STATUSES } from './constants.js';
import { generateDocumentNumber, computeLineTotal, safeNumber, toPlainObject } from './helpers.js';
import { attachPurchaseOrder } from './prService.js';

function startOfDay(date = new Date()) {
  return dayjs(date).startOf('day').toDate();
}

function endOfDay(date = new Date()) {
  return dayjs(date).endOf('day').toDate();
}

function normalizeItems(items = [], currency = 'THB') {
  return items.map((item) => {
    const quantity = safeNumber(item.quantity, 0);
    const unitPrice = safeNumber(item.unitPrice, 0);
    const lineTotal = safeNumber(
      item.amount !== undefined ? item.amount : computeLineTotal(quantity, unitPrice),
      0
    );

    return {
      itemName: item.description || item.itemName,
      sku: item.sku?.trim() || '',
      quantity,
      unit: item.uom || item.unit || 'EA',
      unitPrice,
      currency: item.currency || currency,
      lineTotal,
      note: item.notes || item.note || '',
    };
  });
}

function sum(items, selector) {
  return items.reduce((acc, item) => acc + safeNumber(selector(item), 0), 0);
}

export async function generateNextPoNumber(date = new Date()) {
  const countToday = await PurchaseOrder.countDocuments({
    createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
  });
  return generateDocumentNumber('PO', countToday + 1, date);
}

export async function listPurchaseOrders(filter = {}, opts = {}) {
  const query = {};
  if (filter.status && filter.status !== 'all') query.status = filter.status;
  if (filter.vendorId) query.vendorId = filter.vendorId;
  if (filter.companyId) query.companyId = filter.companyId;
  if (filter.search) {
    query.$or = [
      { poNumber: { $regex: filter.search, $options: 'i' } },
      { 'items.itemName': { $regex: filter.search, $options: 'i' } },
      { remarks: { $regex: filter.search, $options: 'i' } },
    ];
  }

  const cursor = PurchaseOrder.find(query)
    .populate('vendorId')
    .populate('prId')
    .populate('companyId')
    .sort({ createdAt: -1 });

  if (opts.limit) cursor.limit(opts.limit);
  if (opts.skip) cursor.skip(opts.skip);

  return cursor.lean();
}

export async function getPurchaseOrderById(id) {
  if (!id) return null;
  return PurchaseOrder.findById(id).populate('vendorId').populate('prId').lean();
}

export async function getPurchaseOrderByNumber(poNumber) {
  if (!poNumber) return null;
  return PurchaseOrder.findOne({ poNumber })
    .populate('vendorId')
    .populate('prId')
    .populate('companyId')
    .lean();
}

export async function createPurchaseOrder(payload, actor = 'system') {
  const currency = payload.currency || 'THB';
  const poNumber = payload.poNumber || (await generateNextPoNumber());

  const normalizedItems = normalizeItems(payload.items || [], currency);
  const subtotal = sum(normalizedItems, (item) => item.lineTotal);
  const taxAmount = safeNumber(payload.taxAmount ?? subtotal * 0.07, 0);
  const shippingFee = safeNumber(payload.shippingFee, 0);
  const totalAmount = safeNumber(
    payload.totalAmount ?? subtotal + taxAmount + shippingFee,
    subtotal + taxAmount + shippingFee
  );

  const doc = await PurchaseOrder.create({
    prId: payload.prId || null,
    vendorId: payload.vendorId,
    companyId: payload.companyId || null,
    poNumber,
    items: normalizedItems,
    subtotal,
    taxAmount,
    shippingFee,
    totalAmount,
    currency,
    paymentTerms: payload.paymentTerms || 'Credit 30 days',
    incoterms: payload.incoterms || 'FOB',
    shipping: payload.shipping || { shipTo: '', address: '', contact: '' },
    expectedDeliveryDate: payload.expectedDeliveryDate ? new Date(payload.expectedDeliveryDate) : null,
    tracking: payload.tracking || { trackingNumber: '', carrier: '', deliveredAt: null, deliveryProof: [] },
    pdfPath: '',
    pdfUrl: '',
    remarks: payload.remarks || '',
    status: payload.status || PO_STATUSES.DRAFT,
    statusHistory: [
      {
        status: payload.status || PO_STATUSES.DRAFT,
        actor,
        remark: payload.remarks || '',
        at: new Date(),
      },
    ],
  });

  if (payload.prId) {
    await attachPurchaseOrder(payload.prId, doc._id, actor);
  }

  await ProcurementAuditLog.create({
    entityType: 'PO',
    entityId: doc._id,
    action: 'create',
    actor,
    message: `สร้างใบสั่งซื้อ ${poNumber}`,
    metadata: { poNumber },
  });

  return toPlainObject(doc);
}

export async function approvePurchaseOrder(poId, actor = 'system', remark = '') {
  return updatePurchaseOrderStatus(poId, PO_STATUSES.APPROVED, actor, remark);
}

export async function updatePurchaseOrderStatus(poId, status, actor = 'system', remark = '') {
  if (!Object.values(PO_STATUSES).includes(status)) {
    throw new Error('Invalid PO status');
  }

  const doc = await PurchaseOrder.findById(poId);
  if (!doc) throw new Error('PO not found');

  doc.status = status;
  doc.statusHistory.push({ status, actor, remark, at: new Date() });

  if (status === PO_STATUSES.RECEIVED) {
    doc.tracking = {
      ...doc.tracking,
      deliveredAt: doc.tracking?.deliveredAt || new Date(),
    };
  }

  await doc.save();

  await ProcurementAuditLog.create({
    entityType: 'PO',
    entityId: doc._id,
    action: `status:${status}`,
    actor,
    message: `อัปเดตสถานะใบสั่งซื้อ ${doc.poNumber} -> ${status}`,
    metadata: { status },
  });

  return toPlainObject(doc);
}

export async function updateTrackingInfo(poId, trackingPayload = {}, actor = 'system') {
  const doc = await PurchaseOrder.findById(poId);
  if (!doc) throw new Error('PO not found');

  doc.tracking = {
    ...doc.tracking,
    trackingNumber: trackingPayload.trackingNumber || doc.tracking?.trackingNumber || '',
    carrier: trackingPayload.carrier || doc.tracking?.carrier || '',
    deliveredAt: trackingPayload.deliveredAt || doc.tracking?.deliveredAt || null,
  };

  if (Array.isArray(trackingPayload.deliveryProof) && trackingPayload.deliveryProof.length) {
    doc.tracking.deliveryProof = [
      ...(doc.tracking.deliveryProof || []),
      ...trackingPayload.deliveryProof,
    ];
  }

  await doc.save();

  await ProcurementAuditLog.create({
    entityType: 'PO',
    entityId: doc._id,
    action: 'update_tracking',
    actor,
    message: `ปรับปรุงข้อมูลจัดส่ง ${doc.poNumber}`,
    metadata: trackingPayload,
  });

  return toPlainObject(doc);
}

export async function markPdfGenerated(poId, pdfPath, pdfUrl = '') {
  const doc = await PurchaseOrder.findByIdAndUpdate(
    poId,
    { pdfPath, pdfUrl },
    { new: true }
  );
  return toPlainObject(doc);
}

export async function markEmailSent(poId, log = {}) {
  const doc = await PurchaseOrder.findByIdAndUpdate(
    poId,
    {
      emailLog: {
        sent: true,
        sentAt: log.sentAt || new Date(),
        provider: log.provider || '',
        messageId: log.messageId || '',
      },
    },
    { new: true }
  );

  return toPlainObject(doc);
}
