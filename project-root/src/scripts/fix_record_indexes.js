// src/scripts/fix_record_indexes.js
// ---------------------------------------------
// ล้างดัชนีเดิมที่มีปัญหา (companyId_1_direction_1_weighNumber_1)
// แล้วสร้างดัชนีใหม่ที่เหมาะกับการใช้งานสรุปรายวัน
// ใช้กับโปรเจ็กต์ที่เป็น ESM (type: "module")
// ---------------------------------------------

import 'dotenv/config.js';
import mongoose from 'mongoose';
import Record from '../models/Record.js';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/line-erp-notifier';

async function main() {
  const start = Date.now();
  console.log('=== FIX RECORD INDEXES ===');
  console.log('[DB] connecting...', MONGODB_URI);

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  console.log('[DB] connected');
  console.log('[COLLECTION]', Record.collection.namespace);

  // แสดงดัชนีก่อนปรับ
  const before = await Record.collection.indexes();
  console.log('\n[INDEXES - BEFORE]');
  before.forEach((ix) => console.log('-', ix.name, ix.key));

  // 1) ลบดัชนีเก่าๆ ที่อาจชน เช่น companyId_1_direction_1_weighNumber_1
  //    รวมถึงดัชนีใดๆ ที่มี key "direction" + "weighNumber" เพื่อความชัวร์
  const toDropNames = new Set();
  for (const ix of before) {
    const keys = Object.keys(ix.key || {});
    const hasProblemKeys =
      keys.includes('direction') && keys.includes('weighNumber');

    if (ix.name === 'companyId_1_direction_1_weighNumber_1' || hasProblemKeys) {
      toDropNames.add(ix.name);
    }
  }

  for (const name of toDropNames) {
    try {
      await Record.collection.dropIndex(name);
      console.log('[DROP] index removed ->', name);
    } catch (err) {
      if (String(err?.message || '').includes('index not found')) {
        console.log('[DROP] index not found (ok) ->', name);
      } else {
        console.warn('[DROP] index error ->', name, err.message);
      }
    }
  }

  // 2) สร้างดัชนีใหม่ (idempotent: ถ้ามีอยู่แล้ว Mongo จะไม่สร้างซ้ำ)
  // 2.1) unique กันแถวซ้ำด้วย (companyId + rowHash)
  //      ใช้กับการ import ที่เรา generate rowHash จากเนื้อข้อมูล
  await Record.collection.createIndex(
    { companyId: 1, rowHash: 1 },
    {
      name: 'uniq_company_rowhash',
      unique: true,
      // partialFilterExpression: { rowHash: { $exists: true, $type: 'string' } }, // เปิดใช้ได้ถ้าต้องการ
    }
  );
  console.log('[CREATE] uniq_company_rowhash');

  // 2.2) คิวรีสรุปรายวัน/เดือนบ่อยสุด → (companyId, dateStr)
  await Record.collection.createIndex(
    { companyId: 1, dateStr: 1 },
    { name: 'by_company_date' }
  );
  console.log('[CREATE] by_company_date');

  // 2.3) เผื่อสรุปแยกประเภท (BUY/SELL) ด้วย → (companyId, type, dateStr)
  await Record.collection.createIndex(
    { companyId: 1, type: 1, dateStr: 1 },
    { name: 'by_company_type_date' }
  );
  console.log('[CREATE] by_company_type_date');

  // 2.4) เผื่อดูตามโครงการ → (companyId, projectCode, dateStr)
  await Record.collection.createIndex(
    { companyId: 1, projectCode: 1, dateStr: 1 },
    { name: 'by_company_project_date' }
  );
  console.log('[CREATE] by_company_project_date');

  // แสดงดัชนีหลังปรับ
  const after = await Record.collection.indexes();
  console.log('\n[INDEXES - AFTER]');
  after.forEach((ix) => console.log('-', ix.name, ix.key));

  // สรุปเวลา
  const ms = Date.now() - start;
  console.log(`\n[DONE] finished in ${ms} ms`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[FATAL]', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

