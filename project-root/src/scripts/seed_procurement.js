import 'dotenv/config.js';
import mongoose from 'mongoose';

import Vendor from '../models/Vendor.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import { createRequisition, submitForApproval } from '../services/procurement/prService.js';
import { approvePrAndCreatePo } from '../services/procurement/workflowService.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const existingPo = await PurchaseOrder.findOne({ remarks: 'Seed PO sample' });
  if (existingPo) {
    console.log('Seed data already exists. Skipping.');
    await mongoose.disconnect();
    return;
  }

  const vendor = await Vendor.findOneAndUpdate(
    { code: 'SEED-001' },
    {
      name: 'NILA Procurement Demo Co., Ltd.',
      code: 'SEED-001',
      email: 'demo-procurement@nila.example.com',
      phone: '+66-2-555-0100',
      address: '88 Rama 4 Road, Klong Toey, Bangkok 10110',
      productCategories: ['ก่อสร้าง', 'วัสดุ', 'บริการขนส่ง'],
      isActive: true,
      contact: {
        name: 'Demo Approver',
        email: 'approver@nila.example.com',
        phone: '+66-81-777-9123',
      },
      notes: 'Sample vendor created by seed script',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Vendor ready:', vendor.name);

  const pr = await createRequisition(
    {
      requester: 'คุณพิมพ์ใจ รุ่งเรือง',
      vendorId: vendor._id,
      lines: [
        {
          description: 'Fresh Asphalt Mix Type A',
          sku: 'ASPH-A-01',
          quantity: 25,
          uom: 'ตัน',
          unitPrice: 2800,
          amount: 25 * 2800,
          notes: 'เร่งด่วนสำหรับงานปูพื้นลานจอด',
        },
        {
          description: 'Transport Service (Bangkok → Chonburi)',
          sku: 'LOGI-BC-20',
          quantity: 1,
          uom: 'เที่ยว',
          unitPrice: 18000,
          amount: 18000,
          notes: 'รวมค่าพนักงานขับและค่าทางด่วน',
        },
      ],
      taxRate: 0.07,
      taxAmount: 0,
      total: 0,
      notes: 'Seed PR sample data',
    },
    'seed-script'
  );
  console.log('Created PR:', pr.prNumber);

  await submitForApproval(pr._id, 'seed-script', 'auto submit by seed');
  const result = await approvePrAndCreatePo(pr._id, 'seed-script', {
    remark: 'seed approval',
    paymentTerms: 'Credit 30 days',
    incoterms: 'FOB',
    shipping: {
      shipTo: 'NILA Warehouse · EEC',
      address: '700/222 Amata Nakorn, Chonburi 20000',
      contact: '+66-33-888-999',
    },
  });
  if (result.po) {
    await PurchaseOrder.findByIdAndUpdate(result.po._id, { remarks: 'Seed PO sample' });
    console.log('Created PO:', result.po.poNumber);
  }

  await mongoose.disconnect();
  console.log('Seed completed');
}

seed().catch(async (err) => {
  console.error('Seed failed', err);
  await mongoose.disconnect();
  process.exit(1);
});
