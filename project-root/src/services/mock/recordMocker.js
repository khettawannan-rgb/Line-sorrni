// project-root/src/services/mock/recordMocker.js
import crypto from 'node:crypto';
import dayjs from 'dayjs';
import Company from '../../models/Company.js';
import Record from '../../models/Record.js';

const PRODUCTS = [
  { code: 'ASPHALT', name: 'ยางมะตอย' },
  { code: 'AGG34', name: 'หิน 3/4"' },
  { code: 'AGG12', name: 'หิน 1/2"' },
  { code: 'SAND', name: 'ทรายถม' },
  { code: 'FUEL', name: 'น้ำมันเชื้อเพลิง' },
];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function hashRow(input) { return crypto.createHash('sha1').update(input).digest('hex'); }

async function pickCompanies() {
  const companies = await Company.find({}).sort({ name: 1 }).lean();
  return companies || [];
}

export async function ensureMockForDate(companyId, dateStr) {
  const exist = await Record.countDocuments({ companyId, dateStr });
  if (exist > 0) return 0;

  const docs = [];
  const buyN = randInt(6, 16);
  const sellN = randInt(4, 12);

  for (let i = 0; i < buyN; i++) {
    const p = PRODUCTS[randInt(0, PRODUCTS.length - 1)];
    const tons = Number((Math.random() * 20 + 5).toFixed(2));
    const str = `${companyId}|${dateStr}|BUY|${p.code}|${tons}|${i}`;
    docs.push({
      companyId,
      sourceCompanyId: String(companyId),
      sourceCompanyName: '',
      dateStr,
      type: 'BUY',
      product: p.name,
      productDetail: p.code,
      weightTons: tons,
      unit: 'ตัน',
      projectCode: '',
      projectName: '',
      rowHash: hashRow(str),
    });
  }
  for (let i = 0; i < sellN; i++) {
    const p = PRODUCTS[randInt(0, PRODUCTS.length - 1)];
    const tons = Number((Math.random() * 16 + 3).toFixed(2));
    const str = `${companyId}|${dateStr}|SELL|${p.code}|${tons}|${i}`;
    docs.push({
      companyId,
      sourceCompanyId: String(companyId),
      sourceCompanyName: '',
      dateStr,
      type: 'SELL',
      product: p.name,
      productDetail: p.code,
      weightTons: tons,
      unit: 'ตัน',
      projectCode: '',
      projectName: '',
      rowHash: hashRow(str),
    });
  }

  if (!docs.length) return 0;
  try {
    const res = await Record.insertMany(docs, { ordered: false });
    return res.length || docs.length;
  } catch (err) {
    // ignore dup errors
    const dup = err?.writeErrors?.length || 0;
    return Math.max(0, docs.length - dup);
  }
}

export async function ensureMockForYesterdayAllCompanies() {
  const companies = await pickCompanies();
  const today = dayjs().format('YYYY-MM-DD');
  const y = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD');
  for (const c of companies) {
    await ensureMockForDate(c._id, y);
  }
}

export async function backfillMockUntilTodayAllCompanies({ sinceDays = 14 } = {}) {
  const companies = await pickCompanies();
  const today = dayjs().format('YYYY-MM-DD');
  for (const c of companies) {
    // find last date we have
    const last = await Record.findOne({ companyId: c._id }).sort({ dateStr: -1 }).select('dateStr').lean();
    let start = last?.dateStr || dayjs(today).subtract(sinceDays, 'day').format('YYYY-MM-DD');
    const startD = dayjs(start);
    let cur = startD;
    while (cur.isBefore(dayjs(today)) || cur.isSame(dayjs(today))) {
      const d = cur.format('YYYY-MM-DD');
      await ensureMockForDate(c._id, d);
      cur = cur.add(1, 'day');
    }
  }
}

export default {
  ensureMockForDate,
  ensureMockForYesterdayAllCompanies,
  backfillMockUntilTodayAllCompanies,
};
