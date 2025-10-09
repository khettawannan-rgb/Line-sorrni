// project-root/src/scripts/seed_super_admin.js
import 'dotenv/config.js';
import mongoose from 'mongoose';

import Member from '../models/Member.js';
import Company from '../models/Company.js';
import LineConsent from '../models/lineConsent.model.js';

const MONGODB_URI = process.env.MONGODB_URI;

function resolveLineUserId() {
  const cliArg = process.argv[2]?.trim();
  if (cliArg) return cliArg;

  const fromEnv = process.env.SUPER_ADMIN_LINE_USER_ID || '';
  if (fromEnv.trim()) return fromEnv.trim();

  const testIds = (process.env.TEST_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (testIds.length) return testIds[0];

  return null;
}

async function ensureDefaultCompany() {
  let company = null;
  const defaultCompanyId = process.env.DEFAULT_COMPANY_ID?.trim();
  if (defaultCompanyId) {
    company = await Company.findById(defaultCompanyId).lean();
    if (!company) {
      console.warn(`[SEED] DEFAULT_COMPANY_ID=${defaultCompanyId} ไม่พบในฐานข้อมูล`);
    }
  }

  if (!company) {
    company = await Company.findOne().lean();
  }

  if (!company) {
    company = await Company.create({
      name: 'Demo Company',
      timezone: 'Asia/Bangkok',
      dailyTime: '09:00',
      sourceCompanyIds: [],
      sourceCompanyNames: [],
    });
    console.log(`[SEED] สร้างบริษัทเริ่มต้นใหม่ "${company.name}" (${company._id})`);
  }

  return company;
}

async function upsertMember(lineUserId, company) {
  const fallbackDisplayName =
    process.env.SUPER_ADMIN_DISPLAY_NAME || 'Demo Super Admin';

  const member = await Member.findOneAndUpdate(
    { lineUserId },
    {
      $set: {
        companyId: company?._id || null,
        role: 'super',
        active: true,
      },
      $setOnInsert: {
        displayName: fallbackDisplayName,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (!member.displayName) {
    member.displayName = fallbackDisplayName;
    await member.save();
  }

  return member;
}

async function grantConsent(lineUserId, displayName) {
  const now = new Date();
  await LineConsent.findOneAndUpdate(
    { userId: lineUserId },
    {
      $set: {
        displayName,
        status: 'granted',
        grantedAt: now,
      },
      $setOnInsert: {
        history: [],
      },
      $push: {
        history: {
          status: 'granted',
          at: now,
          channel: 'admin-seed',
          note: 'Granted via seed_super_admin.js',
        },
      },
    },
    { upsert: true }
  );
}

async function main() {
  if (!MONGODB_URI) {
    console.error('กรุณาตั้งค่า MONGODB_URI ใน .env ก่อนใช้งานสคริปต์นี้');
    process.exit(1);
  }

  const lineUserId = resolveLineUserId();
  if (!lineUserId) {
    console.error(
      'ไม่พบ LINE userId ให้ส่งเป็นอาร์กิวเมนต์ หรือกำหนด SUPER_ADMIN_LINE_USER_ID / TEST_USER_IDS ใน .env'
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('[SEED] database connected');

  const company = await ensureDefaultCompany();
  const member = await upsertMember(lineUserId, company);
  await grantConsent(member.lineUserId, member.displayName || lineUserId);

  console.log('[SEED] ผูก super admin เรียบร้อย', {
    lineUserId: member.lineUserId,
    memberId: member._id.toString(),
    companyId: member.companyId ? member.companyId.toString() : null,
    role: member.role,
    active: member.active,
  });

  if (!process.env.DEFAULT_COMPANY_ID) {
    console.warn(
      '[SEED] แนะนำให้เพิ่ม DEFAULT_COMPANY_ID ลงใน .env เพื่อให้ฟีเจอร์อื่นใช้บริษัทนี้เป็นค่าเริ่มต้น:',
      `DEFAULT_COMPANY_ID=${member.companyId?.toString() || company?._id?.toString() || ''}`
    );
  }

  await mongoose.disconnect();
  console.log('[SEED] done');
}

main().catch((err) => {
  console.error('[SEED][ERROR]', err);
  process.exit(1);
});
