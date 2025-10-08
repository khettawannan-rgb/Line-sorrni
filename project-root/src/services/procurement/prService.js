// project-root/src/services/procurement/prService.js
import dayjs from 'dayjs';
import PurchaseRequisition from '../../models/PurchaseRequisition.js';
import ProcurementAuditLog from '../../models/ProcurementAuditLog.js';

import {
  PR_STATUSES,
} from './constants.js';
import { generateDocumentNumber, now, toPlainObject } from './helpers.js';

function startOfDay(date = new Date()) {
  return dayjs(date).startOf('day').toDate();
}

function endOfDay(date = new Date()) {
  return dayjs(date).endOf('day').toDate();
}

async function logHistory(prDoc, action, actor = 'system', remark = '') {
  prDoc.history.push({ action, actor, remark, at: new Date() });
  await prDoc.save();
}

export async function generateNextPrNumber(date = new Date()) {
  const countToday = await PurchaseRequisition.countDocuments({
    createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
  });
  return generateDocumentNumber('PR', countToday + 1, date);
}

export async function listRequisitions(filter = {}, opts = {}) {
  const query = {};
  if (filter.status && filter.status !== 'all') query.status = filter.status;
  if (filter.companyId) query.companyId = filter.companyId;
  if (filter.search) {
    query.$or = [
      { prNumber: { $regex: filter.search, $options: 'i' } },
      { 'items.itemName': { $regex: filter.search, $options: 'i' } },
    ];
  }

  const cursor = PurchaseRequisition.find(query)
    .populate('linkedPurchaseOrder')
    .sort({ createdAt: -1 });

  if (opts.limit) cursor.limit(opts.limit);
  if (opts.skip) cursor.skip(opts.skip);

  return cursor.lean();
}

export async function getRequisitionById(id) {
  if (!id) return null;
  return PurchaseRequisition.findById(id)
    .populate('linkedPurchaseOrder')
    .lean();
}

export async function getRequisitionByNumber(prNumber) {
  if (!prNumber) return null;
  return PurchaseRequisition.findOne({ prNumber })
    .populate('linkedPurchaseOrder')
    .lean();
}

export async function createRequisition(payload, actor = 'system') {
  const prNumber = payload.prNumber || (await generateNextPrNumber());
  const doc = await PurchaseRequisition.create({
    ...payload,
    prNumber,
    status: payload.status || PR_STATUSES.DRAFT,
    history: [
      {
        action: 'create',
        actor,
        remark: payload.note || '',
        at: new Date(),
      },
    ],
  });

  await ProcurementAuditLog.create({
    entityType: 'PR',
    entityId: doc._id,
    action: 'create',
    actor,
    message: `สร้างใบขอซื้อ ${prNumber}`,
    metadata: { prNumber },
  });

  return toPlainObject(doc);
}

export async function submitForApproval(prId, actor = 'system') {
  const doc = await PurchaseRequisition.findById(prId);
  if (!doc) throw new Error('PR not found');

  doc.status = PR_STATUSES.PENDING_APPROVAL;
  doc.history.push({
    action: 'submit_for_approval',
    actor,
    at: new Date(),
  });
  await doc.save();

  await ProcurementAuditLog.create({
    entityType: 'PR',
    entityId: doc._id,
    action: 'submit_for_approval',
    actor,
    message: `ส่งขออนุมัติใบขอซื้อ ${doc.prNumber}`,
  });

  return toPlainObject(doc);
}

export async function updateRequisitionStatus(prId, status, actor = 'system', remark = '') {
  if (!Object.values(PR_STATUSES).includes(status)) {
    throw new Error('Invalid PR status');
  }

  const doc = await PurchaseRequisition.findById(prId);
  if (!doc) throw new Error('PR not found');

  doc.status = status;
  if (status === PR_STATUSES.APPROVED) {
    doc.approvedAt = new Date();
    doc.approver = actor;
  }

  doc.history.push({ action: `status:${status}`, actor, remark, at: new Date() });
  await doc.save();

  await ProcurementAuditLog.create({
    entityType: 'PR',
    entityId: doc._id,
    action: `status:${status}`,
    actor,
    message: `อัปเดตสถานะ ${doc.prNumber} -> ${status}`,
    metadata: { status },
  });

  return toPlainObject(doc);
}

export async function attachPurchaseOrder(prId, poId, actor = 'system') {
  const doc = await PurchaseRequisition.findById(prId);
  if (!doc) throw new Error('PR not found');

  doc.linkedPurchaseOrder = poId;
  doc.status = PR_STATUSES.APPROVED;
  doc.approvedAt = doc.approvedAt || new Date();
  doc.history.push({
    action: 'linked_po',
    actor,
    remark: `linked PO ${poId}`,
    at: new Date(),
  });

  await doc.save();
  await ProcurementAuditLog.create({
    entityType: 'PR',
    entityId: doc._id,
    action: 'linked_po',
    actor,
    message: `เชื่อมใบสั่งซื้อ ${poId} กับ ${doc.prNumber}`,
  });

  return toPlainObject(doc);
}
