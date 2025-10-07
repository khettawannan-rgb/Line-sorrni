// src/services/excel.js
import XLSX from 'xlsx';
import dayjs from 'dayjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Record from '../models/Record.js';
import Company from '../models/Company.js';

/* ========================== utils ========================== */

const norm = (v) => String(v ?? '').trim();
const up   = (v) => norm(v).toUpperCase();
const num  = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).toString().replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const equalsIgnoreCase = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const normaliseMixKey = (value) =>
  norm(value)
    .replace(/[()\[\]{}、,]/g, ' ')
    .replace(/[\s\-_/]+/g, '')
    .toUpperCase();

// แปลง input เป็น YYYY-MM-DD (ค.ศ.) รองรับ Excel serial + พ.ศ.
export function excelDateToYMD(d) {
  // Excel serial number
  if (typeof d === 'number' && Number.isFinite(d)) {
    // 25569 = ระยะวันระหว่าง 1900-01-01 กับ 1970-01-01
    const jsDate = new Date(Math.round((d - 25569) * 86400 * 1000));
    return dayjs(jsDate).format('YYYY-MM-DD');
  }

  const s = norm(d);
  if (!s) return '';

  // dd/mm/yyyy หรือ dd-mm-yyyy (รองรับพ.ศ.)
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let [, dd, mm, yyyy] = m1;
    let y = Number(yyyy.length === 2 ? `20${yyyy}` : yyyy);
    if (y > 2400) y -= 543; // พ.ศ. -> ค.ศ.
    return dayjs(`${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`).format('YYYY-MM-DD');
  }

  // yyyy-mm-dd หรือฟอร์แมทที่ dayjs อ่านได้
  const djs = dayjs(s);
  if (djs.isValid()) return djs.format('YYYY-MM-DD');

  return '';
}

function aoaFromSheet(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); // array-of-arrays
}
function countNonEmptyRow(aoa) {
  return aoa.reduce((c, row) => c + (row.some(v => String(v).trim() !== '') ? 1 : 0), 0);
}

/** หาแถวหัวคอลัมน์แบบยืดหยุ่น (มักอยู่ไม่เกิน 100 แถวแรก) */
function findHeaderRow(aoa) {
  const KEYS = [
    'ประเภทชั่ง', 'TRAN TYPE', 'TYPE',
    'สินค้า', 'PRODUCT', 'ITEM',
    'ชื่อ JOB MIX', 'JOB MIX', 'MIX NAME',
    'DD/MM/YYYY', 'วันที่', 'DATE',
    'น้ำหนักสุทธิ FINAL', 'น้ำหนักสุทธิ', 'นน.final', 'นน.', 'WEIGHT', 'NET WEIGHT',
    'หน่วย', 'UNIT'
  ];
  for (let i = 0; i < Math.min(aoa.length, 100); i++) {
    const row = (aoa[i] || []).map(norm);
    const joined = row.join('|').toUpperCase();
    let hit = 0;
    for (const k of KEYS) if (joined.includes(k.toUpperCase())) hit++;
    if (hit >= 2) return i;
  }
  return -1;
}

/** สร้าง objects จาก AOA โดยยึดแถว headerIndex เป็นชื่อคอลัมน์ */
function objectsFromAOA(aoa, headerIndex) {
  const headers = (aoa[headerIndex] || []).map(norm);
  const out = [];
  for (let r = headerIndex + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row.some(v => String(v).trim() !== '')) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    out.push(obj);
  }
  return { headers, rows: out };
}

/** helper: หาชื่อคอลัมน์จาก candidates (exact ก่อน, contains ทีหลัง) */
function picker(headers) {
  const H = headers || [];
  const upH = H.map(h => h.toUpperCase());
  return (...cands) => {
    for (const c of cands) if (H.includes(c)) return c;
    for (const c of cands) {
      const i = upH.findIndex(h => h.includes(c.toUpperCase()));
      if (i >= 0) return H[i];
    }
    return null;
  };
}

/** พยายามเดาคอลัมน์วันที่ ถ้าหาไม่เจอ (ดูจากค่าที่ parse เป็นวันที่ได้เยอะที่สุด) */
function guessDateColumn(headers, rows) {
  const candidates = [];
  for (const h of headers) {
    let ok = 0, total = 0;
    for (const r of rows.slice(0, 200)) {
      const v = r[h];
      if (v === undefined || v === null || v === '') continue;
      total++;
      const ymd = excelDateToYMD(v);
      if (ymd) ok++;
    }
    if (total && ok / total > 0.6) {
      candidates.push({ h, score: ok / Math.max(1,total) });
    }
  }
  candidates.sort((a,b)=>b.score - a.score);
  return candidates[0]?.h || null;
}

/** อ่าน weight → แปลงเป็นตัน (พยายามอ่านจากหลายฟิลด์) */
function normalizeUnit(unitRaw) {
  const unit = up(unitRaw || '');
  if (!unit) return 'ตัน';
  if (unit.includes('ลิตร') || unit.includes('LIT') || unit.includes('LTR')) return 'ลิตร';
  if (unit.includes('กก') || unit.includes('KG')) return 'กิโลกรัม';
  if (unit.includes('ตัน') || unit.includes('TON') || unit.includes('T.')) return 'ตัน';
  return 'ตัน';
}

function toTons(val, unitRaw) {
  const w = num(val);
  const unit = up(unitRaw || '');
  if (!w) return 0;
  if (unit.includes('กก') || unit.includes('KG')) return w / 1000;
  if (unit.includes('ตัน') || unit.includes('TON') || unit.includes('T.')) return w;
  // ถ้าไม่ระบุหน่วย ให้เดาว่า กก.
  return w / 1000;
}

/* ========================== core ========================== */

/** อ่านไฟล์ Excel → แถวข้อมูล + ช่วงวันที่ + แผนที่ mix
 *  คืนค่า: { rowsAll, rowsMix, dateRange: {minDate, maxDate} }
 */
export function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = wb.SheetNames || [];

  // เลือกชีต MIX
  const mixName = sheetNames.find(n => /mix/i.test(n));

  // เลือกชีต ALL (ชื่อสื่อก่อน, ไม่งั้นเลือกชีต non-mix ที่ข้อมูลเยอะสุด)
  let allName =
    sheetNames.find(n => /all[_\s]?data/i.test(n)) ||
    sheetNames
      .filter(n => !/mix/i.test(n))
      .map(n => {
        const aoa = aoaFromSheet(wb.Sheets[n]);
        return { n, rows: countNonEmptyRow(aoa) };
      })
      .sort((a, b) => b.rows - a.rows)[0]?.n;

  if (!allName) {
    console.warn('[EXCEL] No suitable ALL sheet. Names =', sheetNames);
    return { rowsAll: [], rowsMix: [], dateRange: { minDate: null, maxDate: null } };
  }

  // อ่านชีต ALL แบบ AOA → objects
  const aoaAll = aoaFromSheet(wb.Sheets[allName]);
  const hdrAll = findHeaderRow(aoaAll);
  if (hdrAll < 0) {
    console.warn('[EXCEL] Cannot locate header row for ALL sheet:', allName);
    return { rowsAll: [], rowsMix: [], dateRange: { minDate: null, maxDate: null } };
  }
  const { headers: H, rows: rowsAllRaw } = objectsFromAOA(aoaAll, hdrAll);
  const pick = picker(H);

  // อ่านชีต MIX (ถ้ามี)
  const rowsMix = mixName
    ? XLSX.utils.sheet_to_json(wb.Sheets[mixName], { defval: '' })
    : [];

  // map โค้ด → ชื่อโครงการ และ map ชื่อ mix → รายละเอียดโครงการ
  const mixCodeMap = new Map();
  const mixJobMap = new Map();
  for (const r of rowsMix) {
    const codeRaw = norm(r.code || r.CODE || r.mixCode || r['Mix Code'] || r['MIX CODE']);
    const code = codeRaw ? codeRaw.toUpperCase() : '';
    const projectName = norm(
      r.projectName || r['Project Name'] || r['PROJECT NAME'] ||
      r['ชื่อโครงการ'] || r['ชื่องาน'] || r.name || r.NAME
    );
    const mixNameLabel = norm(
      r.mixName || r['Mix Name'] || r['MIX NAME'] ||
      r.jobMix || r['Job Mix'] || r['JOB MIX NAME'] || r['JOB MIX']
    );

    if (code) {
      if (projectName) mixCodeMap.set(code, projectName);
      if (mixNameLabel) {
        const key = normaliseMixKey(mixNameLabel);
        if (!mixJobMap.has(key)) {
          mixJobMap.set(key, {
            code,
            name: projectName || mixNameLabel,
            mixLabel: mixNameLabel,
          });
        }
      }
    }
  }

  // mapping คอลัมน์ (ยืดหยุ่น)
  const COL_COMPANY  = pick('บริษัท', 'Company', 'COMPANY', 'COMPANY NAME', 'ลูกค้า/บริษัท');
  const COL_COMPANY_ID = pick('companyId', 'COMPANY ID', 'CompanyId', 'รหัสบริษัท', 'COMPANY CODE');
  const COL_TYPE     = pick('ประเภทชั่ง', 'TRAN TYPE', 'TYPE', 'DIRECTION');
  const COL_PROD     = pick('สินค้า', 'PRODUCT', 'ITEM', 'MATERIAL');
  const COL_JOBMIX   = pick('ชื่อ Job Mix', 'JOB MIX', 'MIX NAME', 'JOB MIX NAME');
  let   COL_DATE     = pick('DD/MM/YYYY', 'วันที่', 'DATE', 'TRANSACTION DATE', 'DOC DATE');
  const COL_WEIGHT   = pick('น้ำหนักสุทธิ final','น้ำหนักสุทธิ','นน.final','นน.','WEIGHT','NET WEIGHT');
  const COL_UNIT     = pick('หน่วย', 'UNIT');
  const COL_NOTE     = pick('หมายเหตุ', 'NOTE','REMARK');
  const COL_CUST     = pick('ชื่อลูกค้า','ลูกค้า','CUSTOMER');
  const COL_CODE     = pick('CODE','รหัส','รหัสงาน','Project Code','MIX CODE','SITE CODE');
  const COL_WNO      = pick('เลขที่ชั่ง','WEIGH NO','WEIGH NUMBER','SCALE NO');

  // ถ้าหาวันที่ไม่เจอ ให้เดา
  if (!COL_DATE) {
    COL_DATE = guessDateColumn(H, rowsAllRaw);
    if (!COL_DATE) {
      console.warn('[EXCEL] Cannot find/guess date column. Headers =', H);
    }
  }

  const out = [];
  let minDate = null, maxDate = null;

  for (const r of rowsAllRaw) {
    // 1) วันที่
    const dateStr = excelDateToYMD(r[COL_DATE]);
    if (!dateStr) continue; // ถ้าวันที่พัง ข้าม (กัน dateStr=null ใน DB)

    if (!minDate || dateStr < minDate) minDate = dateStr;
    if (!maxDate || dateStr > maxDate) maxDate = dateStr;

    // 2) ประเภท
    const typeRaw = up(r[COL_TYPE] || '');
    const companyName = norm(r[COL_COMPANY]) || norm(r.companyName || r['COMPANY']);
    const companyIdRaw = norm(r[COL_COMPANY_ID]) || norm(r.companyId || r['COMPANYID']);
    // 3) สินค้า/รายละเอียด
    let product = norm(r[COL_PROD]);
    let productDetail = norm(r[COL_JOBMIX]); // Binder / Wearing ฯลฯ (ขาย)
    // 4) หน่วย/น้ำหนัก → แปลงเป็นตัน
    const unitNorm = normalizeUnit(r[COL_UNIT]);
    const tons = toTons(r[COL_WEIGHT], r[COL_UNIT]);
    if (tons <= 0) continue;

    // 5) โครงการ/รหัสจากคอลัมน์หรือหมายเหตุ
    let projectCode = norm(r[COL_CODE]).toUpperCase();
    let projectName = '';

    if (!projectCode && productDetail) {
      const jobLookup = mixJobMap.get(normaliseMixKey(productDetail));
      if (jobLookup) {
        projectCode = jobLookup.code;
        projectName = jobLookup.name || projectName;
        if (!projectName && jobLookup.mixLabel) projectName = jobLookup.mixLabel;
      }
    }

    if (!projectCode) {
      const note = norm(r[COL_NOTE]);
      const directCode = note.match(/code\s*=\s*([A-Za-z0-9_-]+)/i);
      if (directCode) projectCode = directCode[1].toUpperCase();
    }
    if (!projectCode) {
      const note = norm(r[COL_NOTE]);
      const impliedCode = note.match(/([A-Za-z]{3}\d{3,})/);
      if (impliedCode) projectCode = impliedCode[1].toUpperCase();
    }
    if (!projectCode) {
      const customerCode = norm(r[COL_CUST]).match(/([A-Za-z]{3}\d{3,})/);
      if (customerCode) projectCode = customerCode[1].toUpperCase();
    }
    if (projectCode) {
      projectName = mixCodeMap.get(projectCode) || projectName;
    }

    // 6) direction/weighNumber (ถ้ามีในไฟล์)
    const weighNumber = norm(r[COL_WNO]);
    let direction = '';
    if (typeRaw.includes('BUY') || /IN\b|ขาเข้า/i.test(typeRaw)) direction = 'IN';
    else if (typeRaw.includes('SELL') || /OUT\b|ขาออก/i.test(typeRaw)) direction = 'OUT';

    // 7) type: ถ้าไม่ชัด → มี job mix ถือเป็น SELL ไม่งั้น BUY
    let type = '';
    if (typeRaw.includes('BUY') || direction === 'IN') type = 'BUY';
    else if (typeRaw.includes('SELL') || direction === 'OUT') type = 'SELL';
    else type = productDetail ? 'SELL' : 'BUY';

    // 8) normalize product
    const productFinal =
      product || (type === 'SELL' ? 'แอสฟัลต์ติกคอนกรีต' : 'ไม่ระบุ');

    const row = {
      dateStr,
      type,                              // BUY / SELL
      product: productFinal,
      productDetail,                     // ใช้แจกแจง SELL รายชนิดผิวทาง
      weightTons: +Number(tons).toFixed(3),
      unit: unitNorm,
      customer: norm(r[COL_CUST]),
      note: norm(r[COL_NOTE]),
      projectCode: projectCode || '',
      projectName: projectName || '',
      weighNumber: weighNumber || null,
      direction: direction || null,
      sourceCompanyId: companyIdRaw || '',
      sourceCompanyName: companyName || '',
    };

    row.rowHash = sha1(
      JSON.stringify({
        dateStr: row.dateStr,
        type: row.type,
        product: row.product,
        productDetail: row.productDetail,
        weightTons: row.weightTons,
        projectCode: row.projectCode,
        weighNumber: row.weighNumber,
        sourceCompanyId: row.sourceCompanyId || '',
        sourceCompanyName: row.sourceCompanyName || '',
      })
    );

    out.push(row);
  }

  return {
    rowsAll: out,
    rowsMix,
    dateRange: { minDate, maxDate },
  };
}

/** นำแถวเข้า Mongo (กัน duplicate ด้วย rowHash) */
export async function importRecords(rows) {
  if (!Array.isArray(rows)) throw new Error('rows must be array');

  if (!rows.length) return { inserted: 0, skipped: 0 };

  const docs = [];
  const seenKey = new Set();

  const companyMatchers = (await Company.find({}, { name: 1, sourceCompanyIds: 1, sourceCompanyNames: 1 }).lean()).map((c) => ({
    id: c._id,
    ids: (c.sourceCompanyIds || []).map((s) => s.trim()).filter(Boolean),
    names: (c.sourceCompanyNames || []).map((s) => s.trim()).filter(Boolean),
    name: (c.name || '').trim(),
  }));

  for (const r of rows) {
    if (!r?.dateStr) continue;

    const key = `${r.sourceCompanyId || r.sourceCompanyName || 'UNKNOWN'}::${r.rowHash}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    const doc = {
      dateStr: r.dateStr,
      type: r.type,
      product: r.product,
      productDetail: r.productDetail,
      weightTons: r.weightTons,
      unit: r.unit || 'ตัน',
      note: r.note,
      customer: r.customer,
      projectCode: r.projectCode || '',
      projectName: r.projectName || '',
      weighNumber: r.weighNumber || null,
      direction: r.direction || null,
      rowHash: r.rowHash,
      sourceCompanyId: r.sourceCompanyId || '',
      sourceCompanyName: r.sourceCompanyName || '',
    };

    if (r.companyId && mongoose.Types.ObjectId.isValid(r.companyId)) {
      doc.companyId = new mongoose.Types.ObjectId(r.companyId);
    } else if (companyMatchers.length) {
      const sourceId = (doc.sourceCompanyId || '').trim();
      const sourceName = (doc.sourceCompanyName || '').trim();
      const matched = companyMatchers.find((c) => (
        (sourceId && c.ids.some((id) => equalsIgnoreCase(id, sourceId))) ||
        (sourceName && c.names.some((name) => equalsIgnoreCase(name, sourceName))) ||
        (sourceName && c.name && equalsIgnoreCase(c.name, sourceName))
      ));
      if (matched) doc.companyId = matched.id;
    }

    docs.push(doc);
  }

  let insertedCount = 0;
  if (docs.length) {
    try {
      const res = await Record.insertMany(docs, { ordered: false });
      insertedCount = Array.isArray(res) ? res.length : docs.length;
    } catch (err) {
      if (err?.writeErrors) {
        insertedCount = docs.length - err.writeErrors.length;
      } else {
        throw err;
      }
    }
  }

  return { inserted: insertedCount, skipped: rows.length - insertedCount };
}

/** สรุปผลหลังนำเข้าไว้โชว์หน้า Upload (กันกรณี type ไม่ชัดเจน) */
export function summarizeImported(rows) {
  const BUY = Object.create(null);
  const SELL = Object.create(null);
  let inTons = 0, outTons = 0;

  for (const r of rows) {
    const tons = Number(r?.weightTons || 0);
    if (!tons) continue;

    // ถ้า type ว่าง/ไม่ชัด → เดาจาก productDetail (มี => SELL, ไม่มี => BUY)
    let type = (r?.type || '').toString().toUpperCase();
    if (type !== 'BUY' && type !== 'SELL') {
      type = r?.productDetail ? 'SELL' : 'BUY';
    }

    if (type === 'BUY') {
      const key = (r?.product && r.product.toString().trim())
        ? r.product.toString().trim()
        : 'ไม่ระบุ';
      BUY[key] = (BUY[key] || 0) + tons;
      inTons += tons;
    } else {
      const key = r?.productDetail
        ? `แอสฟัลต์ (${r.productDetail})`
        : (r?.product?.toString().trim() || 'แอสฟัลต์');
      SELL[key] = (SELL[key] || 0) + tons;
      outTons += tons;
    }
  }

  const round = (obj) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, +Number(v).toFixed(3)]));

  return {
    BUY: round(BUY),
    SELL: round(SELL),
    totals: {
      inTons: +inTons.toFixed(3),
      outTons: +outTons.toFixed(3),
    },
  };
}
