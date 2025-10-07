// src/services/summary.js
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import Record from '../models/Record.js';
import MixMap from '../models/MixMap.js';
import MixAggregate from '../models/MixAggregate.js';
import Company from '../models/Company.js';

/* ========================= Utils ========================= */

// ดึง "ตัน" จากเรคคอร์ดให้ยืดหยุ่น (ลองหลายฟิลด์)
function getTons(r) {
  const t = r?.weightTons ?? r?.tons ?? r?.['นน.finalตัน'];
  if (t !== undefined && t !== null && !isNaN(t)) return Number(t);
  const kg = r?.weightKg ?? r?.['นน.final'] ?? r?.weight;
  if (kg !== undefined && kg !== null && !isNaN(kg)) return Number(kg) / 1000;
  return 0;
}

// รวมตามคีย์
function sumByKey(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r); if (!k) continue;
    const w = getTons(r); if (!w) continue;
    m.set(k, (m.get(k) || 0) + w);
  }
  return m;
}

// รวม SELL รายหน้างาน + เก็บชื่อไซต์จาก MixMap
function sumSellBySite(rows, siteMetaByCode) {
  const res = new Map();
  for (const r of rows) {
    const code = r.projectCode || r.siteCode || r.mixCode || r.code || '';
    const base = r.product || r['สินค้า'] || r.item || '';
    const product = r.productDetail ? `แอสฟัลต์ (${r.productDetail})` : base;
    const w = getTons(r);
    if (!code || !w) continue;
    if (!res.has(code)) {
      const meta = siteMetaByCode.get(code) || {};
      res.set(code, {
        totalTons: 0,
        byProduct: new Map(),
        siteName: meta.name || r.projectName || r.siteName || '',
        mixName: meta.mixName || '',
      });
    }
    const s = res.get(code);
    s.totalTons += w;
    if (product) s.byProduct.set(product, (s.byProduct.get(product) || 0) + w);
  }
  return res;
}

const tidy = n => +Number(n || 0).toFixed(2);

// --- utils: แปลง input date เป็น ISO CE (YYYY-MM-DD) ---
export function normalizeInputDateToISO(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // already ISO CE
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy หรือ dd-mm-yyyy (รองรับ พ.ศ.)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let year = Number(y.length === 2 ? `20${y}` : y);
    if (year > 2400) year -= 543; // BE -> CE
    const dd = String(d).padStart(2, '0');
    const mm = String(mo).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
  const p = dayjs(s);
  return p.isValid() ? p.format('YYYY-MM-DD') : '';
}

// CE -> BE (string)
function toBE(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(y) + 543}-${m}-${d}`;
}

/* ========================= Core ========================= */

/**
 * ✅ มาตรฐาน: คิวรีด้วย $in ทั้ง CE และ BE (รองรับกรณีไฟล์เก่าเก็บ พ.ศ.)
 *   buildDailySummary(companyId, dateInput)
 *     - dateInput รองรับ 'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', พ.ศ./ค.ศ.
 */
export async function buildDailySummary(companyId, dateInput) {
  const isoDate = normalizeInputDateToISO(dateInput);
  const beDate = toBE(isoDate);

  const companyMatch = await buildCompanyRecordMatch(companyId);
  if (!companyMatch) {
    return {
      companyId,
      dateStr: isoDate,
      in: { totalTons: 0, items: [] },
      out: { totalTons: 0, items: [], sites: [] },
    };
  }

  const rows = await Record.find({
    ...companyMatch,
    dateStr: { $in: [isoDate, beDate].filter(Boolean) },
  }).lean();

  // DIAG ช่วยหาสาเหตุได้ว่า “ทำไม 0”
  if (!rows.length) {
    const [cAll, cCE, cBE] = await Promise.all([
      Record.countDocuments({ companyId }),
      Record.countDocuments({ companyId, dateStr: isoDate }),
      Record.countDocuments({ companyId, dateStr: beDate }),
    ]);
    console.log('[SUMMARY][EMPTY]', {
      companyId,
      dateISO: isoDate,
      beDate,
      totalAll: cAll,
      totalCE: cCE,
      totalBE: cBE,
    });
  } else {
    console.log('[SUMMARY][FOUND]', {
      companyId,
      dateISO: isoDate,
      beDate,
      count: rows.length,
      sample: rows[0],
    });
  }

  // แยก BUY / SELL
  const rowsBuy  = rows.filter(r => String(r.type || r.tranType || '').toUpperCase() === 'BUY');
  const rowsSell = rows.filter(r => String(r.type || r.tranType || '').toUpperCase() === 'SELL');

  // รวมตามชนิดสินค้า
  const buyByProduct = sumByKey(rowsBuy, r =>
    (r.product && r.product.toString().trim()) ? r.product.toString().trim() : 'ไม่ระบุ'
  );
  const sellByProduct = sumByKey(
    rowsSell,
    r => (r.productDetail ? `แอสฟัลต์ (${r.productDetail})`
                           : (r.product || r['สินค้า'] || r.item || 'ไม่ระบุ'))
  );

  // รวมรายหน้างาน (ใช้ MixMap เติมชื่อ)
  const sellCodes = Array.from(
    rowsSell.reduce((s, r) => {
      const c = r.projectCode || r.siteCode || r.mixCode || r.code;
      if (c) s.add(String(c).toUpperCase());
      return s;
    }, new Set())
  );
  const sourceCompanyIds = Array.from(
    rowsSell.reduce((set, row) => {
      const value = String(row.sourceCompanyId || '').trim();
      if (value) set.add(value);
      return set;
    }, new Set())
  );
  const sourceCompanyNames = Array.from(
    rowsSell.reduce((set, row) => {
      const value = String(row.sourceCompanyName || '').trim();
      if (value) set.add(value);
      return set;
    }, new Set())
  );

  const companyIdStr = companyId?.toString?.() ?? '';
  const baseMixClauses = [];
  if (mongoose.Types.ObjectId.isValid(companyIdStr)) {
    baseMixClauses.push({ companyId: new mongoose.Types.ObjectId(companyIdStr) });
  }
  if (sourceCompanyIds.length) {
    baseMixClauses.push({ sourceCompanyId: { $in: sourceCompanyIds } });
  }
  if (sourceCompanyNames.length) {
    baseMixClauses.push({ sourceCompanyName: { $in: sourceCompanyNames } });
  }

  const mixQuery = [];
  if (sellCodes.length) {
    if (baseMixClauses.length) {
      mixQuery.push(...baseMixClauses.map((clause) => ({ ...clause, code: { $in: sellCodes } })));
    }
    mixQuery.push({ code: { $in: sellCodes } });
  } else if (baseMixClauses.length) {
    mixQuery.push(...baseMixClauses);
  }

  let mixDocs = [];
  if (mixQuery.length) {
    mixDocs = await MixMap.find({ $or: mixQuery }).lean();
  }

  if (mixDocs.length === 0 && sellCodes.length) {
    mixDocs = await MixMap.find({ code: { $in: sellCodes } }).lean();
  }

  const mixAggregateFilter = { dateStr: isoDate };
  if (companyMatch?.$or) mixAggregateFilter.$or = companyMatch.$or;
  else if (companyMatch) Object.assign(mixAggregateFilter, companyMatch);

  const mixAggregateDocs = await MixAggregate.find(mixAggregateFilter).lean();

  const siteMetaByCode = new Map(
    mixDocs.map((doc) => [doc.code, { name: doc.name || '', mixName: doc.mixName || '' }])
  );
  const sellBySite = sumSellBySite(rowsSell, siteMetaByCode);

  const mixProjects = mixAggregateDocs
    .map((doc) => ({
      code: doc.projectCode || '',
      name: doc.projectName || '',
      mixName: doc.mixName || '',
      totalTons: tidy(doc.totalNetWeightTons),
      entryCount: doc.entryCount || 0,
    }))
    .filter((item) => item.totalTons > 0)
    .sort((a, b) => b.totalTons - a.totalTons);
  const mixProjectsTotal = tidy(mixProjects.reduce((sum, item) => sum + item.totalTons, 0));

  // แปลงเป็น array + ปัดทศนิยม
  const inItems  = Array.from(buyByProduct.entries()).map(([product, tons]) => ({
    product, tons: tidy(tons)
  }));
  const outItems = Array.from(sellByProduct.entries()).map(([product, tons]) => ({
    product, tons: tidy(tons)
  }));
  const totalIn  = tidy(inItems.reduce((a, b) => a + b.tons, 0));
  const totalOut = tidy(outItems.reduce((a, b) => a + b.tons, 0));

  const sites = Array.from(sellBySite.entries()).map(([code, obj]) => ({
    siteCode: code,
    siteName: obj.siteName || '',
    siteMixName: obj.mixName || '',
    totalTons: tidy(obj.totalTons),
    items: Array.from(obj.byProduct.entries()).map(([product, tons]) => ({
      product, tons: tidy(tons)
    })),
  }));

  return {
    companyId,
    dateStr: isoDate, // เก็บเป็น CE สม่ำเสมอ
    in:  { totalTons: totalIn,  items: inItems },
    out: {
      totalTons: totalOut,
      items: outItems,
      sites,
      projects: mixProjects,
      projectsTotal: mixProjectsTotal,
    },
  };
}

/* ========================= Render LINE ========================= */

export function renderDailySummaryMessage(summary) {
  const d = dayjs(summary.dateStr).format('DD/MM/YYYY');
  const fmt = n => (n ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

  const inLines = summary.in.items.length
    ? summary.in.items.map(it => {
        const emoji =
          /หิน|stone|rock/i.test(it.product) ? '🪨' :
          /ทราย|sand/i.test(it.product) ? '🏖️' :
          /ยาง|แอสฟัลต์|asphalt/i.test(it.product) ? '🛢️' : '📦';
        return `${emoji} ${it.product} : ${fmt(it.tons)} ตัน`;
      })
    : ['— ไม่มีรายการ —'];
  inLines.push(`รวมขาเข้า : ${fmt(summary.in.totalTons)} ตัน`);

  const outLines = summary.out.items.length
    ? summary.out.items.map(it => {
        const emoji = /แอสฟัลต์|asphalt/i.test(it.product) ? '🛣️' : '📤';
        return `${emoji} ${it.product} : ${fmt(it.tons)} ตัน`;
      })
    : ['— ไม่มีรายการ —'];
  outLines.push(`รวมขาออก : ${fmt(summary.out.totalTons)} ตัน`);

  const siteLines = [];
  if (summary.out.sites?.length) {
    if (summary.out.sites.length === 1) {
      const s = summary.out.sites[0];
      const label = s.siteName || s.siteMixName || '-';
      const codeStr = s.siteCode ? ` (${s.siteCode})` : '';
      siteLines.push(`➡️ หน้างาน: ${label}${codeStr}`);
      if (s.siteMixName && s.siteMixName !== s.siteName) {
        siteLines.push(`🧪 Mix: ${s.siteMixName}`);
      }
      (s.items || []).forEach((it) =>
        siteLines.push(`• ${it.product} : ${fmt(it.tons)} ตัน`)
      );
    } else {
      siteLines.push('➡️ รายละเอียดตามหน้างาน:');
      summary.out.sites.forEach((s) => {
        const label = s.siteName || s.siteMixName || '-';
        const codeStr = s.siteCode ? ` (${s.siteCode})` : '';
        siteLines.push(`- ${label}${codeStr} : ${fmt(s.totalTons)} ตัน`);
        if (s.siteMixName && s.siteMixName !== s.siteName) {
          siteLines.push(`   • Mix: ${s.siteMixName}`);
        }
        (s.items || []).forEach((it) => {
          siteLines.push(`   • ${it.product} : ${fmt(it.tons)} ตัน`);
        });
      });
    }
  } else if (summary.out.projects?.length) {
    const projectTotal = summary.out.projectsTotal ?? summary.out.projects.reduce((sum, p) => sum + (p.totalTons || 0), 0);
    siteLines.push('➡️ โครงการจาก MIX (ยังไม่พบยอดผูกกับหน้างาน):');
    summary.out.projects.forEach((p) => {
      const label = p.name || p.mixName || '-';
      const codeStr = p.code ? ` (${p.code})` : '';
      const tonsStr = p.totalTons ? ` : ${fmt(p.totalTons)} ตัน` : '';
      siteLines.push(`- ${label}${codeStr}${tonsStr}`);
    });
    if (projectTotal) {
      siteLines.push(`รวม MIX : ${fmt(projectTotal)} ตัน`);
    }
  }

  return (
    `📌 รายงานประจำวัน ${d}\n\n` +
    `📥 ขาเข้า (วัตถุดิบ)\n${inLines.join('\n')}\n\n` +
    `📤 ขาออก\n${outLines.join('\n')}` +
    (siteLines.length ? `\n\n${siteLines.join('\n')}` : '') +
    `\n\nพิมพ์ "เมนู" เพื่อเลือกช่วงอื่น ๆ`
  );
}

/* ========================= Keyword → Range ========================= */

export function getDateRangeFromKeyword(text) {
  const raw = (text || '').toString().trim().toLowerCase();
  const today = dayjs();
  const fmt = d => dayjs(d).format('YYYY-MM-DD');

  if (/(^|[^ก-๙a-z])(วันนี้|today)([^ก-๙a-z]|$)/i.test(text || '')) {
    const d = fmt(today); return { dateFrom: d, dateTo: d };
  }
  if (/(^|[^ก-๙a-z])(เมื่อวาน|yesterday)([^ก-๙a-z]|$)/i.test(text || '')) {
    const d = fmt(today.subtract(1, 'day')); return { dateFrom: d, dateTo: d };
  }
  if (/7\s*วัน|ย้อนหลัง\s*7\s*วัน|last\s*7\s*days/i.test(raw)) {
    return { dateFrom: fmt(today.subtract(6, 'day')), dateTo: fmt(today) };
  }
  if (/สัปดาห์นี้|this\s*week/i.test(raw)) {
    return { dateFrom: fmt(today.startOf('week')), dateTo: fmt(today.endOf('week')) };
  }
  if (/เดือนนี้|this\s*month/i.test(raw)) {
    return { dateFrom: fmt(today.startOf('month')), dateTo: fmt(today.endOf('month')) };
  }
  if (/เดือนที่แล้ว|last\s*month/i.test(raw)) {
    const last = today.subtract(1, 'month');
    return { dateFrom: fmt(last.startOf('month')), dateTo: fmt(last.endOf('month')) };
  }
  const d = fmt(today);
  return { dateFrom: d, dateTo: d };
}

/* ========================= Aliases ========================= */

export { buildDailySummary as buildSummary };

export async function buildCompanyRecordMatch(companyId) {
  if (!companyId) return null;
  const ors = [];
  if (mongoose.Types.ObjectId.isValid(companyId)) {
    ors.push({ companyId: new mongoose.Types.ObjectId(companyId) });
  }

  let companyDoc = null;
  try {
    companyDoc = await Company.findById(companyId).lean();
  } catch (_) {
    companyDoc = null;
  }

  if (companyDoc) {
    const ids = (companyDoc.sourceCompanyIds || []).map((s) => s.trim()).filter(Boolean);
    ids.forEach((id) => {
      const trimmed = (id || '').trim();
      if (!trimmed) return;
      ors.push({ sourceCompanyId: trimmed });
      ors.push({ sourceCompanyId: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
    });

    const nameVariants = (companyDoc.sourceCompanyNames || [])
      .flatMap(buildNameVariants)
      .filter(Boolean);
    nameVariants.forEach((name) => {
      ors.push({ sourceCompanyName: name });
      const rx = buildLooseNameRegex(name);
      if (rx) ors.push({ sourceCompanyName: rx });
    });

    if (companyDoc.name) {
      const variants = buildNameVariants(companyDoc.name);
      variants.forEach((variant) => {
        ors.push({ sourceCompanyName: variant });
        const rx = buildLooseNameRegex(variant);
        if (rx) ors.push({ sourceCompanyName: rx });
      });
    }
  }

  if (!ors.length) return null;
  return { $or: ors };
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameVariants(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];

  const variants = new Set([trimmed]);

  const normalised = trimmed
    .replace(/บริษัท\s*(จำกัด\s*\(มหาชน\)|จำกัด|มหาชน)?/gi, ' ')
    .replace(/ห้างหุ้นส่วน\s*(จำกัด)?/gi, ' ')
    .replace(/หจก\.?/gi, ' ')
    .replace(/บจก\.?/gi, ' ')
    .replace(/จำกัด/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalised) variants.add(normalised);

  return Array.from(variants);
}

function buildLooseNameRegex(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const escaped = escapeRegex(trimmed);
  const pattern = escaped.replace(/\s+/g, '\\s*');
  return new RegExp(pattern, 'i');
}
