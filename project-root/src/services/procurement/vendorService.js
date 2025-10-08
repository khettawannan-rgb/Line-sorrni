// project-root/src/services/procurement/vendorService.js
import Vendor from '../../models/Vendor.js';
import ProcurementAuditLog from '../../models/ProcurementAuditLog.js';

import { now, toPlainObject } from './helpers.js';

export async function listVendors(filter = {}) {
  const query = {};
  if (filter.activeOnly) query.isActive = true;
  if (filter.category) query.productCategories = filter.category;
  return Vendor.find(query).sort({ name: 1 }).lean();
}

export async function getVendorById(id) {
  if (!id) return null;
  return Vendor.findById(id).lean();
}

export async function createVendor(payload, actor = 'system') {
  const doc = await Vendor.create(payload);
  await ProcurementAuditLog.create({
    entityType: 'VENDOR',
    entityId: doc._id,
    action: 'create',
    actor,
    message: `สร้างผู้จัดจำหน่าย ${doc.name}`,
    metadata: { vendorId: doc._id.toString() },
  });
  return toPlainObject(doc);
}

export async function updateVendor(id, payload, actor = 'system') {
  if (!id) throw new Error('Vendor ID is required');
  const doc = await Vendor.findByIdAndUpdate(id, payload, { new: true });
  if (!doc) throw new Error('Vendor not found');
  await ProcurementAuditLog.create({
    entityType: 'VENDOR',
    entityId: doc._id,
    action: 'update',
    actor,
    message: `อัปเดตข้อมูลผู้จัดจำหน่าย ${doc.name}`,
    metadata: { vendorId: doc._id.toString() },
  });
  return toPlainObject(doc);
}

export async function deactivateVendor(id, actor = 'system') {
  if (!id) throw new Error('Vendor ID is required');
  const doc = await Vendor.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!doc) throw new Error('Vendor not found');
  await ProcurementAuditLog.create({
    entityType: 'VENDOR',
    entityId: doc._id,
    action: 'deactivate',
    actor,
    message: `ปิดการใช้งานผู้จัดจำหน่าย ${doc.name}`,
    metadata: { vendorId: doc._id.toString() },
  });
  return toPlainObject(doc);
}

export async function ensureSeedVendors() {
  const count = await Vendor.countDocuments();
  if (count > 0) return count;

  const seedEntries = [
    {
      name: 'Bangkok Concrete Supply',
      email: 'sales@bkkconcrete.example.com',
      phone: '+66-2010-5000',
      address: '99 Rama IV Rd, Klong Toey, Bangkok 10110',
      productCategories: ['คอนกรีต', 'หิน', 'ทราย'],
      meta: { preferredLeadTimeDays: 2, paymentTerms: 'COD' },
      contact: {
        name: 'นภัสสร แสงทอง',
        email: 'napassorn@bkkconcrete.example.com',
        phone: '+66-89-999-1000',
      },
    },
    {
      name: 'Thai Steel Trade',
      email: 'purchase@thaasteel.example.com',
      phone: '+66-2301-4455',
      address: '55 Bangna-Trad Rd, Bangna, Bangkok 10260',
      productCategories: ['เหล็ก', 'โครงสร้าง'],
      meta: { preferredLeadTimeDays: 5, paymentTerms: 'Credit 30 days' },
      contact: {
        name: 'รัฐนนท์ มณีโชติ',
        email: 'rattanon@thaasteel.example.com',
        phone: '+66-82-333-9988',
      },
    },
  ];

  const docs = await Vendor.insertMany(seedEntries);
  await ProcurementAuditLog.insertMany(
    docs.map((doc) => ({
      entityType: 'VENDOR',
      entityId: doc._id,
      action: 'seed',
      actor: 'system',
      message: `seed vendor ${doc.name}`,
      metadata: { at: now().toISOString() },
    }))
  );
  return docs.length;
}
