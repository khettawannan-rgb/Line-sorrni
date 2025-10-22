// project-root/src/routes/admin.js
import express from 'express';
import multer from 'multer';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Company from '../models/Company.js';
import Template from '../models/Template.js';
import Keyword from '../models/Keyword.js';
import BotFaq from '../models/BotFaq.js';
import faqSeed from '../data/botFaqSeed.js';
import Record from '../models/Record.js';
import MixMap from '../models/MixMap.js';
import MixAggregate from '../models/MixAggregate.js';
import Member from '../models/Member.js';
import LineConsent from '../models/lineConsent.model.js';
import AudienceGroup from '../models/audienceGroup.model.js';
import LineChatLog from '../models/lineChatLog.model.js';
import LineMedia from '../models/lineMedia.model.js';
import { sanitizeRedirect } from '../utils/url.js';
import { pushFlex, flexAdminShortcuts } from '../services/flex.js';
import { isSuperAdminSession } from '../middleware/checkSuperAdmin.js';

import { parseExcel, importRecords, summarizeImported, excelDateToYMD } from '../services/excel.js';
import { buildDailySummary, renderDailySummaryMessage, buildCompanyRecordMatch } from '../services/summary.js';
import {
  pushLineMessage,
  // Rich Menu APIs
  getRichMenuList,
  deleteRichMenu,
  setDefaultRichMenu,
  createRichMenu,
  uploadRichMenuImage,
  getBotInfo,
  checkRichMenuImageExists,
  // LINE profile
  getUserProfile,
} from '../services/line.js';
import { adminSetConsentStatus } from '../services/consent.js';
import procurementRouter from './procurement.js';
import {
  invalidateBotFaqCache,
  getBotFaqStats,
  bulkInsertFaqs,
} from '../services/botFaq.js';
import { ensureMockForYesterdayAllCompanies, backfillMockUntilTodayAllCompanies } from '../services/mock/recordMocker.js';
import { generateSnapshot } from '../services/procurement/stockService.js';
import {
  seedMockAnalytics,
  buildIntentTrend,
  buildCohortHeatmap,
  buildSentimentTrend,
  buildSlaVsCsat,
  buildHourHeatmap,
  buildSegmentBreakdown,
} from '../services/mock-analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || 'pk.eyJ1Ijoia2hldHRhd2FubmFuIiwiYSI6ImNtZnoxOG1ybzBxbXQya29ud2VtcHQycmcifQ.Ea7buOSEjrwx5VdFVhqSkw';
const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : ''; // updated to use BASE_URL
const SUPER_ADMIN_UID = 'U3cbb8e21f7603d7eaa5a88cbba51c77b'; // Super Admin bypass logic

const splitListInput = (value = '') =>
  String(value || '')
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);

// local helper to format UTC date to YYYY-MM-DD
function toISODate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function renderBotFaq(res, { form = null, error = null, message = '' } = {}) {
  const [entries, stats] = await Promise.all([
    BotFaq.find({})
      .sort({ intent: 1, priority: 1, createdAt: -1 })
      .lean(),
    getBotFaqStats(),
  ]);

  res.render('bot_faq', {
    title: 'Bot Q&A',
    active: 'bot-faq',
    entries,
    stats,
    form,
    error,
    message,
  });
}

/* ------------------------------------------------------------------ */
/* Shared helpers / middlewares                                        */
/* ------------------------------------------------------------------ */

router.use((req, res, next) => {
  const isSuperAdmin = isSuperAdminSession(req);
  if (isSuperAdmin && !req.session?.user) {
    req.session.user = { username: 'Khet', role: 'Super Admin', superAdmin: true };
  }
  res.locals.user = req.session?.user || null;
  res.locals.isSuperAdmin = isSuperAdmin;
  next();
});

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (isSuperAdminSession(req)) return next();
  const target = BASE_URL ? `${BASE_URL}/admin/login` : '/admin/login'; // updated to use BASE_URL
  return res.redirect(target);
}

const TH_PROVINCES = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'
];

function extractProvince(location = {}) {
  const address = String(location.address || '').trim();
  if (!address) return null;
  const match = address.match(/จังหวัด\s*([\u0E00-\u0E7F]+)/);
  if (match && match[1]) {
    return normaliseProvince(match[1]);
  }
  for (const province of TH_PROVINCES) {
    if (address.includes(province)) return province;
  }
  if (/กรุงเทพ|bangkok/i.test(address)) return 'กรุงเทพมหานคร';
  return null;
}

function normaliseProvince(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return null;
  for (const province of TH_PROVINCES) {
    if (cleaned.startsWith(province)) return province;
  }
  return cleaned;
}

function buildProvinceSummary(locations = []) {
  const map = new Map();
  for (const loc of locations) {
    const province = extractProvince(loc.location) || 'ไม่ทราบจังหวัด';
    const lat = Number(loc.location?.latitude);
    const lng = Number(loc.location?.longitude);
    if (!map.has(province)) {
      map.set(province, { province, count: 0, latSum: 0, lngSum: 0, hasCoords: 0 });
    }
    const entry = map.get(province);
    entry.count += 1;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      entry.latSum += lat;
      entry.lngSum += lng;
      entry.hasCoords += 1;
    }
  }

  return Array.from(map.values()).map((entry) => ({
    province: entry.province,
    count: entry.count,
    latitude: entry.hasCoords ? entry.latSum / entry.hasCoords : null,
    longitude: entry.hasCoords ? entry.lngSum / entry.hasCoords : null,
  }));
}

// สรุปสถิติเพื่อโชว์ในหน้า Upload
function buildStatsForView(rowsAll = []) {
  const toKg = (r) => {
    if (r?.weightTons !== undefined && r?.weightTons !== null)
      return Number(r.weightTons) * 1000;
    const kg = r?.weightKg ?? r?.['นน.final'] ?? r?.weight;
    return Number(kg || 0);
  };

  const buyMap = new Map();
  const sellMap = new Map();
  let buyTotalKg = 0;
  let sellTotalKg = 0;

  for (const r of rowsAll) {
    const type = String(r.type || '').toUpperCase();
    let product = r.product || r['สินค้า'] || r.item || '';
    if (type === 'SELL' && r.productDetail) product = `แอสฟัลต์ (${r.productDetail})`;

    const kg = toKg(r);
    if (!kg) continue;

    if (type === 'BUY') {
      buyMap.set(product, (buyMap.get(product) || 0) + kg);
      buyTotalKg += kg;
    } else if (type === 'SELL') {
      sellMap.set(product, (sellMap.get(product) || 0) + kg);
      sellTotalKg += kg;
    }
  }

  const toList = (m) =>
    Array.from(m.entries())
      .map(([product, kg]) => ({
        product,
        kg: Number(kg),
        tons: Number((kg / 1000).toFixed(2)),
        tonStr: (kg / 1000).toFixed(2).replace(/\.00$/, ''),
      }))
      .sort((a, b) => b.kg - a.kg);

  return { buyList: toList(buyMap), sellList: toList(sellMap), buyTotalKg, sellTotalKg };
}

function parseSourceList(input) {
  return String(input || '')
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** เลือก “วันที่ที่มีข้อมูลจริง” จากสิ่งที่ผู้ใช้เลือก */
async function pickUsableDate(companyId, isoDate) {
  if (!companyId || !isoDate) return { picked: isoDate, reason: 'none' };
  const matchBase = await buildCompanyRecordMatch(companyId);
  if (!matchBase) return { picked: isoDate, reason: 'none' };

  const totalForCompany = await Record.countDocuments({ ...matchBase, dateStr: { $type: 'string' } });
  if (totalForCompany === 0) {
    console.warn('[PICK DATE][NO DATA]', { companyId, requested: isoDate });
    return { picked: isoDate, reason: 'no-data' };
  }

  const exactMatch = { ...matchBase, dateStr: isoDate };
  const cExact = await Record.countDocuments(exactMatch);
  if (cExact > 0) return { picked: isoDate, reason: 'exact' };

  const monthPrefix = isoDate.slice(0, 7);
  const beDate = computeBEDate(isoDate);
  const sameMonth = await findFirstSameMonth(matchBase, [monthPrefix, beDate?.slice(0, 7)].filter(Boolean));
  if (sameMonth) return { picked: sameMonth, reason: 'same-month' };

  const latestAny = await Record.aggregate([
    { $match: { ...matchBase, dateStr: { $type: 'string' } } },
    { $group: { _id: '$dateStr', c: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 1 },
  ]);
  if (latestAny[0]?.['_id']) return { picked: latestAny[0]._id, reason: 'latest-any' };

  return { picked: isoDate, reason: 'none' };
}

function computeBEDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(year)) return '';
  const beYear = year + 543;
  return `${beYear}${isoDate.slice(4)}`;
}

async function findFirstSameMonth(matchBase, prefixes = []) {
  for (const prefix of prefixes) {
    if (!prefix) continue;
    const rows = await Record.aggregate([
      { $match: { ...matchBase, dateStr: { $regex: new RegExp(`^${escapeRegex(prefix)}-`) } } },
      { $group: { _id: '$dateStr', c: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 1 },
    ]);
    if (rows[0]?._id) return rows[0]._id;
  }
  return null;
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadRecentDates(companyId) {
  const id = companyId?.toString?.();
  if (!id) return [];
  const matchBase = await buildCompanyRecordMatch(id);
  if (!matchBase) return [];
  return Record.aggregate([
    { $match: { ...matchBase, dateStr: { $type: 'string' } } },
    { $group: { _id: '$dateStr', count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 50 },
    { $project: { _id: 0, dateStr: '$_id', count: 1 } },
  ]);
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

router.get('/login', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isLineMobile = /Line/i.test(userAgent) && /Mobile/i.test(userAgent);
  let redirect = sanitizeRedirect(req.query.redirect || req.headers.referer || '/admin');
  if (redirect.startsWith('/admin/login')) {
    redirect = '/admin';
  }
  res.locals.redirectTo = redirect;
  res.render('auth/login', {
    error: null,
    title: 'เข้าสู่ระบบ',
    active: 'login',
    noChrome: true,
    fullWidth: true,
    bodyVariant: 'login-hero',
    isLineMobile,
    isSuperAdminLocked: isSuperAdminSession(req),
    user: null,
    redirect,
  });
});

router.post('/login', (req, res) => {
  const { ADMIN_USER, ADMIN_PASS } = process.env;
  const { username, password, redirect: redirectBody } = req.body || {};
  const redirect = sanitizeRedirect(redirectBody || req.query.redirect || '/admin');
  const ok = username === ADMIN_USER && password === ADMIN_PASS;
  console.log(`[AUTH] login ${ok ? 'OK' : 'fail'} for ${username}`);
  if (ok) {
    req.session.user = { username, role: 'admin' };
    return res.redirect(redirect);
  }
  return res.render('auth/login', {
    error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    title: 'เข้าสู่ระบบ',
    active: 'login',
    noChrome: true,
    fullWidth: true,
    bodyVariant: 'login-hero',
    isLineMobile: /Line/i.test(req.headers['user-agent'] || '') && /Mobile/i.test(req.headers['user-agent'] || ''),
    user: null,
    redirect,
  });
});

router.get('/logout', (req, res) =>
  req.session.destroy(() => {
    const target = BASE_URL ? `${BASE_URL}/admin/login` : '/admin/login'; // updated to use BASE_URL
    res.redirect(target);
  })
);

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

async function buildDashboardContext() {
  const MAP_LOCATION_LIMIT = 400;
  const now = dayjs();
  const fourteenDaysAgo = now.subtract(13, 'day').startOf('day').toDate();
  const sevenDaysAgo = now.subtract(7, 'day').startOf('day').toDate();
  const thirtyDaysAgo = now.subtract(30, 'day').startOf('day').toDate();

  const [
    companies,
    recordTypeAgg,
    recordProductAgg,
    recordProductOverallAgg,
    recordCompanyAgg,
    recordDailyAgg,
    mixAggregates,
    latestRecords,
    distinctUsers,
    recentChats,
    consentProfiles,
    recentLocationEvents,
    chatTrendAgg,
    chatUserAgg,
    consentStatusAgg,
  ] = await Promise.all([
    Company.find().lean(),
    Record.aggregate([
      {
        $group: {
          _id: '$type',
          totalTons: { $sum: { $ifNull: ['$weightTons', 0] } },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { totalTons: -1 } },
    ]),
    Record.aggregate([
      {
        $group: {
          _id: { product: '$product', type: '$type' },
          totalTons: { $sum: { $ifNull: ['$weightTons', 0] } },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { totalTons: -1 } },
      { $limit: 12 },
    ]),
    Record.aggregate([
      {
        $group: {
          _id: '$product',
          totalTons: { $sum: { $ifNull: ['$weightTons', 0] } },
          entryCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          product: { $ifNull: ['$_id', '(ไม่ระบุ)'] },
          totalTons: 1,
          entryCount: 1,
        },
      },
      { $sort: { totalTons: -1 } },
      { $limit: 8 },
    ]),
    Record.aggregate([
      {
        $group: {
          _id: '$companyId',
          totalTons: { $sum: { $ifNull: ['$weightTons', 0] } },
          buyTons: {
            $sum: {
              $cond: [{ $eq: ['$type', 'BUY'] }, { $ifNull: ['$weightTons', 0] }, 0],
            },
          },
          sellTons: {
            $sum: {
              $cond: [{ $eq: ['$type', 'SELL'] }, { $ifNull: ['$weightTons', 0] }, 0],
            },
          },
          entryCount: { $sum: 1 },
          latestDate: { $max: '$dateStr' },
        },
      },
      { $sort: { totalTons: -1 } },
      { $limit: 10 },
    ]),
    Record.aggregate([
      {
        $group: {
          _id: '$dateStr',
          totalTons: { $sum: { $ifNull: ['$weightTons', 0] } },
          buyTons: {
            $sum: {
              $cond: [{ $eq: ['$type', 'BUY'] }, { $ifNull: ['$weightTons', 0] }, 0],
            },
          },
          sellTons: {
            $sum: {
              $cond: [{ $eq: ['$type', 'SELL'] }, { $ifNull: ['$weightTons', 0] }, 0],
            },
          },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 7 },
    ]),
    MixAggregate.aggregate([
      {
        $group: {
          _id: {
            projectCode: '$projectCode',
            projectName: '$projectName',
            mixName: '$mixName',
          },
          totalNetWeightTons: { $sum: { $ifNull: ['$totalNetWeightTons', 0] } },
          entryCount: { $sum: { $ifNull: ['$entryCount', 0] } },
          dayCount: { $addToSet: '$dateStr' },
        },
      },
      {
        $project: {
          _id: 0,
          projectCode: '$_id.projectCode',
          projectName: '$_id.projectName',
          mixName: '$_id.mixName',
          totalNetWeightTons: 1,
          entryCount: 1,
          dayCount: { $size: '$dayCount' },
        },
      },
      { $sort: { totalNetWeightTons: -1 } },
      { $limit: 15 },
    ]),
    Record.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('companyId', 'name')
      .lean(),
    LineChatLog.distinct('userId'),
    LineChatLog.find({}).sort({ createdAt: -1 }).limit(200).lean(),
    LineConsent.find({}).select('userId displayName status updatedAt').sort({ updatedAt: -1 }).limit(50).lean(),
    LineMedia.find({ type: 'location' })
      .sort({ timestamp: -1 })
      .limit(MAP_LOCATION_LIMIT)
      .lean(),
    LineChatLog.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $project: {
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Asia/Bangkok',
            },
          },
          userId: '$userId',
        },
      },
      {
        $group: {
          _id: '$day',
          messageCount: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          messageCount: 1,
          uniqueUsers: {
            $size: {
              $filter: {
                input: '$users',
                as: 'u',
                cond: { $and: [{ $ne: ['$$u', null] }, { $ne: ['$$u', ''] }] },
              },
            },
          },
        },
      },
      { $sort: { date: 1 } },
    ]),
    LineChatLog.aggregate([
      { $match: { userId: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$userId',
          firstActive: { $min: '$createdAt' },
          lastActive: { $max: '$createdAt' },
          messageCount: { $sum: 1 },
          messages7d: {
            $sum: { $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, 1, 0] },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          active7d: { $sum: { $cond: [{ $gte: ['$lastActive', sevenDaysAgo] }, 1, 0] } },
          active30d: { $sum: { $cond: [{ $gte: ['$lastActive', thirtyDaysAgo] }, 1, 0] } },
          new7d: { $sum: { $cond: [{ $gte: ['$firstActive', sevenDaysAgo] }, 1, 0] } },
          totalMessages: { $sum: '$messageCount' },
          totalMessages7d: { $sum: '$messages7d' },
        },
      },
    ]),
    LineConsent.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const totals = recordTypeAgg.reduce(
    (acc, item) => {
      acc.records += item.entryCount || 0;
      acc.totalTons += item.totalTons || 0;
      if (item._id === 'BUY') acc.buyTons += item.totalTons || 0;
      if (item._id === 'SELL') acc.sellTons += item.totalTons || 0;
      return acc;
    },
    { records: 0, totalTons: 0, buyTons: 0, sellTons: 0 }
  );

  const companyMap = companies.reduce((acc, c) => {
    acc[c._id.toString()] = c;
    return acc;
  }, {});

  const companySummary = recordCompanyAgg.map((row) => {
    const companyId = row._id?.toString();
    const comp = companyId ? companyMap[companyId] : null;
    return {
      companyId,
      name: comp?.name || 'Unknown company',
      totalTons: row.totalTons || 0,
      buyTons: row.buyTons || 0,
      sellTons: row.sellTons || 0,
      entryCount: row.entryCount || 0,
      latestDate: row.latestDate || null,
    };
  });

  const dailySeries = [...recordDailyAgg]
    .map((row) => ({
      date: row._id,
      totalTons: row.totalTons || 0,
      buyTons: row.buyTons || 0,
      sellTons: row.sellTons || 0,
      entryCount: row.entryCount || 0,
    }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const productChart = recordProductOverallAgg.map((row, idx) => ({
    product: row.product || '(ไม่ระบุ)',
    totalTons: row.totalTons || 0,
    entryCount: row.entryCount || 0,
    colorIndex: idx,
  }));

  const productChartTotal = productChart.reduce((sum, row) => sum + (row.totalTons || 0), 0) || 0;

  const mixSummary = (mixAggregates || []).map((doc) => ({
    projectName: doc.projectName || '(ไม่ระบุ)',
    projectCode: doc.projectCode || '',
    mixName: doc.mixName || '',
    totalNetWeightTons: Number(doc.totalNetWeightTons || 0),
    entryCount: doc.entryCount || 0,
  }));
  const mixSummaryTotalTons = mixSummary.reduce((sum, item) => sum + (item.totalNetWeightTons || 0), 0);

  const messageTypeCount = recentChats.reduce((acc, log) => {
    const key = log.messageType || log.type || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topicDefinitions = [
    { key: 'report', label: 'ขอสรุปรายงาน', patterns: [/รายงาน/i, /สรุป/i, /report/i] },
    { key: 'link', label: 'ขอลิงก์/ผูกบัญชี', patterns: [/ลิงก์/i, /link/i, /ผูก/i, /เชื่อม/i] },
    { key: 'upload', label: 'อัปโหลดไฟล์', patterns: [/อัป/i, /อัพ/i, /upload/i, /ไฟล์/i, /excel/i] },
    { key: 'help', label: 'ขอความช่วยเหลือ', patterns: [/ช่วย/i, /ทำยังไง/i, /error/i, /ไม่ได้/i] },
    { key: 'greeting', label: 'ทักทาย/ทั่วไป', patterns: [/สวัสดี/i, /hello/i, /hi/i, /ทดสอบ/i] },
    { key: 'test', label: 'ทดสอบระบบ', patterns: [/test/i, /เทส/i, /ทดลอง/i] },
  ];

  const topicBuckets = topicDefinitions.reduce((acc, def) => {
    acc[def.key] = { key: def.key, label: def.label, count: 0, samples: [] };
    return acc;
  }, {});
  topicBuckets.other = { key: 'other', label: 'อื่น ๆ', count: 0, samples: [] };

  const classifyMessage = (text = '') => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 'other';
    for (const def of topicDefinitions) {
      if (def.patterns.some((re) => re.test(trimmed))) return def.key;
    }
    return 'other';
  };

  for (const log of recentChats) {
    if (log.messageType === 'text') {
      const groupKey = classifyMessage(log.text || '');
      const bucket = topicBuckets[groupKey] || topicBuckets.other;
      bucket.count += 1;
      if (bucket.samples.length < 3) {
        bucket.samples.push((log.text || '').slice(0, 80));
      }
    } else if (log.messageType) {
      const key = `media:${log.messageType}`;
      if (!topicBuckets[key]) {
        topicBuckets[key] = { key, label: `สื่อประเภท ${log.messageType}`, count: 0, samples: [] };
      }
      topicBuckets[key].count += 1;
    } else {
      topicBuckets.other.count += 1;
    }
  }

  const topicSummary = Object.values(topicBuckets)
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count);

  const chatTrend = (chatTrendAgg || []).map((row) => ({
    date: row.date,
    messageCount: row.messageCount || 0,
    uniqueUsers: row.uniqueUsers || 0,
  }));

  const chatUserRaw = (chatUserAgg && chatUserAgg[0]) || {};
  const chatUserStats = {
    totalUsers: chatUserRaw.totalUsers || 0,
    active7d: chatUserRaw.active7d || 0,
    active30d: chatUserRaw.active30d || 0,
    new7d: chatUserRaw.new7d || 0,
    returning7d: Math.max((chatUserRaw.active7d || 0) - (chatUserRaw.new7d || 0), 0),
    messagesTotal: chatUserRaw.totalMessages || 0,
    messages7d: chatUserRaw.totalMessages7d || 0,
  };

  const consentStatusSummary = (consentStatusAgg || []).reduce(
    (acc, doc) => {
      if (!doc?._id) return acc;
      acc[doc._id] = doc.count || 0;
      acc.total += doc.count || 0;
      return acc;
    },
    { total: 0 }
  );

  const latestUsers = consentProfiles.slice(0, 12).map((c) => ({
    userId: c.userId,
    displayName: c.displayName || '(ไม่มีชื่อ)',
    status: c.status,
    updatedAt: c.updatedAt,
  }));

  const provinceMapRaw = buildProvinceSummary(recentLocationEvents || []);
  const provinceMap = [...provinceMapRaw].sort((a, b) => b.count - a.count);
  const provinceMapTop = provinceMap
    .filter((item) => item.province && item.province !== 'ไม่ทราบจังหวัด')
    .slice(0, 4);
  const provinceMapStats = {
    totalLocations: (recentLocationEvents || []).length,
    uniqueUsers: recentLocationEvents ? new Set(recentLocationEvents.map((loc) => loc.userId)).size : 0,
    totalProvinces: provinceMap.length,
    provincesWithCoords: provinceMap.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).length,
    lastUpdatedAt: recentLocationEvents && recentLocationEvents.length ? recentLocationEvents[0].timestamp : null,
  };

  return {
    companies,
    totals,
    recordTypeAgg,
    recordProductAgg,
    productChart,
    productChartTotal,
    mixSummary,
    mixSummaryTotalTons,
    companySummary,
    dailySeries,
    dailySeriesPayload: JSON.stringify(dailySeries || []),
    latestRecords,
    chat: {
      distinctUsers: distinctUsers.length,
      recentCount: recentChats.length,
      messageTypeCount,
      topicSummary,
      latestUsers,
    },
    chatTrend,
    chatUserStats,
    consentStatusSummary,
    provinceMap,
    provinceMapTop,
    provinceMapStats,
    mapboxToken: MAPBOX_TOKEN,
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const context = await buildDashboardContext();
    res.render('dashboard', {
      ...context,
      title: 'Dashboard',
      active: 'dashboard',
      subPage: 'overview',
    });
  } catch (err) {
    console.error('[ADMIN] dashboard error', err);
    res.status(500).render('error', { message: 'ไม่สามารถโหลดแดชบอร์ดได้ในขณะนี้', error: err });
  }
});

router.get('/dashboard/engagement', requireAuth, async (req, res) => {
  try {
    const context = await buildDashboardContext();

    const USE_MOCK = String(process.env.USE_MOCK_ANALYTICS || '').toLowerCase() === 'true';
    const sessionSeed = Number(req.session?.mockAnalyticsSeed || 0);
    const seed = Number(req.query.seed || sessionSeed || 123456);

    let mock = null;
    let mockPayload = {};
    if (USE_MOCK) {
      try {
        const to = new Date();
        const from = new Date(to);
        from.setUTCDate(from.getUTCDate() - 56);
        mock = seedMockAnalytics({ seed, from: toISODate(from), to: toISODate(to) });

        // Trend series (chat): per day counts and unique users
        const byDay = new Map();
        const uniqueByDay = new Map();
        (mock.events || []).forEach((e) => {
          const d = e.ts.slice(0, 10);
          byDay.set(d, (byDay.get(d) || 0) + 1);
          const set = uniqueByDay.get(d) || new Set();
          set.add(e.user_id);
          uniqueByDay.set(d, set);
        });
        const trendSeries = Array.from(byDay.entries())
          .map(([date, messageCount]) => ({ date, messageCount, uniqueUsers: (uniqueByDay.get(date) || new Set()).size }))
          .sort((a, b) => a.date.localeCompare(b.date));

        mockPayload = {
          useMockAnalytics: true,
          mockSeed: seed,
          mock,
          trendSeries,
          intentStack: buildIntentTrend(mock),
          retention: buildCohortHeatmap(mock),
          sentiment: buildSentimentTrend(mock),
          hourHeatmap: buildHourHeatmap(mock),
          segmentStack: buildSegmentBreakdown(mock),
          agentResponse: buildSlaVsCsat(mock),
        };

        // Override data feeds used by dashboard engagement cards
        context.trendSeries = trendSeries;
      } catch (e) {
        console.warn('[ADMIN] mock analytics generation failed:', e?.message || e);
        mock = null;
      }
    }

    const safeTrendSeries = Array.isArray(context.trendSeries) ? context.trendSeries : [];
    res.render('dashboard', {
      ...context,
      ...(mock ? mockPayload : {}),
      useMockAnalytics: !!mock,
      // Ensure legacy template references don't crash
      trendSeries: safeTrendSeries,
      title: 'Dashboard · Engagement',
      active: 'dashboard',
      subPage: 'engagement',
    });
  } catch (err) {
    console.error('[ADMIN] dashboard engagement error', err);
    // Fail-soft: render page with minimal context so that UIยังใช้งานได้
    try {
      res.render('dashboard', {
        title: 'Dashboard · Engagement',
        active: 'dashboard',
        subPage: 'engagement',
        useMockAnalytics: false,
        trendSeries: [],
        mapboxToken: MAPBOX_TOKEN,
        dailySeries: [],
        productChart: [],
        mixSummary: [],
        companySummary: [],
        latestRecords: [],
        chat: { distinctUsers: 0, recentCount: 0, messageTypeCount: {}, topicSummary: [], latestUsers: [] },
        chatTrend: [], chatUserStats: {},
        consentStatusSummary: {},
        provinceMap: [], provinceMapTop: [], provinceMapStats: {},
      });
    } catch (err2) {
      console.error('[ADMIN] engagement fallback render failed', err2);
      res.status(500).render('error', { message: 'ไม่สามารถโหลดหน้าพฤติกรรมผู้ใช้ได้', error: err2 });
    }
  }
});

router.get('/dashboard/control', requireAuth, async (req, res) => {
  try {
    const context = await buildDashboardContext();
    res.render('dashboard', {
      ...context,
      title: 'Dashboard · Control Center',
      active: 'dashboard',
      subPage: 'control',
    });
  } catch (err) {
    console.error('[ADMIN] dashboard control error', err);
    res.status(500).render('error', { message: 'ไม่สามารถโหลดหน้าศูนย์ควบคุมได้', error: err });
  }
});

// ---- Mock analytics controls (logic only; used by Secret Manual Send button) ----
router.post('/mock/analytics/regenerate', requireAuth, (req, res) => {
  const USE_MOCK = String(process.env.USE_MOCK_ANALYTICS || '').toLowerCase() === 'true';
  if (!USE_MOCK) return res.status(400).json({ ok: false, error: 'mock disabled' });
  const seed = Number(req.body?.seed || Date.now() % 2147483647);
  if (!req.session) return res.status(500).json({ ok: false, error: 'no session' });
  req.session.mockAnalyticsSeed = seed >>> 0;
  res.json({ ok: true, seed: req.session.mockAnalyticsSeed });
});

router.post('/mock/analytics/send', requireAuth, (req, res) => {
  const USE_MOCK = String(process.env.USE_MOCK_ANALYTICS || '').toLowerCase() === 'true';
  if (!USE_MOCK) return res.status(400).json({ ok: false, error: 'mock disabled' });
  // This endpoint is a stub for sending demo flex or summary
  // It simply regenerates a lightweight preview payload from the current seed
  const seed = Number(req.session?.mockAnalyticsSeed || 123456);
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 7);
  const mock = seedMockAnalytics({ seed, from: toISODate(from), to: toISODate(to) });
  const topTopics = (mock.events || []).reduce((acc, e) => {
    acc[e.topic] = (acc[e.topic] || 0) + 1;
    return acc;
  }, {});
  const top = Object.entries(topTopics).sort((a, b) => b[1] - a[1]).slice(0, 3);
  res.json({ ok: true, preview: { seed, from: mock.from, to: mock.to, topTopics: top } });
});

router.get('/insights', requireAuth, async (req, res) => {
  const [messageCount, uniqueUsers, latestMessage, consents, dailyStats] = await Promise.all([
    LineChatLog.countDocuments({}),
    LineChatLog.distinct('userId'),
    LineChatLog.findOne({}).sort({ createdAt: -1 }).lean(),
    LineConsent.find({}).sort({ updatedAt: -1 }).lean(),
    LineChatLog.aggregate([
      { $match: {} },
      {
        $project: {
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Asia/Bangkok',
            },
          },
        },
      },
      { $group: { _id: '$day', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
  ]);

  const consentSummary = consents.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    { pending: 0, granted: 0, revoked: 0 }
  );

  const recentMessages = await LineChatLog.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const consentMap = consents.reduce((acc, c) => {
    acc[c.userId] = c;
    return acc;
  }, {});

  res.render('insights', {
    title: 'Insights',
    active: 'insights',
    stats: {
      messageCount,
      uniqueUsers: uniqueUsers.length,
      lastMessageAt: latestMessage?.createdAt || null,
      consentSummary,
    },
    dailyStats,
    consents,
    consentMap,
    recentMessages,
  });
});

/* ------------------------------------------------------------------ */
/* Audience groups                                                     */
/* ------------------------------------------------------------------ */

router.get('/audiences', requireAuth, async (req, res) => {
  const groups = await AudienceGroup.find({}).sort({ updatedAt: -1 }).lean();
  res.render('audience_groups', {
    title: 'Audience Groups',
    active: 'dashboard',
    groups,
  });
});

router.get('/audiences/new', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const criteria = { status: 'granted' };
  if (q) {
    criteria.$or = [{ displayName: new RegExp(q, 'i') }, { userId: new RegExp(q, 'i') }];
  }
  const users = await LineConsent.find(criteria).sort({ updatedAt: -1 }).limit(200).lean();
  res.render('audience_group_form', {
    title: 'New Audience Group',
    active: 'dashboard',
    users,
    q,
    form: {},
  });
});

router.post('/audiences', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const userIds = Array.isArray(req.body.userIds)
    ? req.body.userIds.filter(Boolean)
    : req.body.userIds
    ? [String(req.body.userIds)]
    : [];
  if (!name) return res.status(400).send('name required');
  const uniq = [...new Set(userIds)];
  await AudienceGroup.create({ name, description, userIds: uniq });
  res.redirect('/admin/audiences');
});

router.post('/audiences/:id/delete', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (id) {
    try { await AudienceGroup.findByIdAndDelete(id); } catch {}
  }
  res.redirect('/admin/audiences');
});


/* ------------------------------------------------------------------ */
/* Consents (Manual override for testing)                             */
/* ------------------------------------------------------------------ */

router.get('/consents', requireAuth, async (req, res) => {
  const search = String(req.query.q || '').trim();
  const statusFilter = String(req.query.status || '').trim();
  const criteria = {};

  if (search) {
    const escaped = search.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    criteria.$or = [{ userId: regex }, { displayName: regex }];
  }

  const allowedStatuses = ['pending', 'granted', 'revoked'];
  if (allowedStatuses.includes(statusFilter)) {
    criteria.status = statusFilter;
  }

  const limit = Math.max(10, Math.min(Number(req.query.limit) || 100, 500));
  const consents = await LineConsent.find(criteria).sort({ updatedAt: -1 }).limit(limit).lean();

  const summaryAgg = await LineConsent.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const summary = { pending: 0, granted: 0, revoked: 0 };
  for (const row of summaryAgg) {
    if (row && Object.prototype.hasOwnProperty.call(summary, row._id)) {
      summary[row._id] = row.count;
    }
  }

  const feedback = {
    success: req.query.ok ? `อัปเดตสถานะเรียบร้อยสำหรับ ${req.query.user || ''}` : '',
    error: req.query.error || '',
  };

  res.render('consents', {
    title: 'Consents',
    active: 'consents',
    consents,
    search,
    statusFilter,
    limit,
    summary,
    feedback,
  });
});

/* ------------------------------------------------------------------ */
/* Locations (Recent shared positions)                                */
/* ------------------------------------------------------------------ */

router.get('/locations', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 10), 500);

  const [locations, totalLocations, distinctUsers] = await Promise.all([
    LineMedia.find({ type: 'location' })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean(),
    LineMedia.countDocuments({ type: 'location' }),
    LineMedia.distinct('userId', { type: 'location' }),
  ]);

  const userIds = locations.map((loc) => loc.userId);
  const consentDocs = userIds.length
    ? await LineConsent.find({ userId: { $in: userIds } })
        .select('userId displayName status updatedAt')
        .lean()
    : [];
  const consentMap = consentDocs.reduce((acc, doc) => {
    acc[doc.userId] = doc;
    return acc;
  }, {});

  const latest = locations[0] || null;
  const stats = {
    locations: totalLocations,
    uniqueUsers: distinctUsers.length,
    lastTimestamp: latest?.timestamp || null,
  };
  const provinceSummary = buildProvinceSummary(locations);

  res.render('locations', {
    title: 'Locations',
    active: 'locations',
    locations,
    consentMap,
    stats,
    limit,
    provinceSummary,
    mapboxToken: MAPBOX_TOKEN,
  });
});

router.post('/consents/update', requireAuth, async (req, res) => {
  const { userId, status, note, displayName, search, statusFilter, limit } = req.body || {};

  const params = new URLSearchParams();
  const searchValue = typeof search === 'string' ? search.trim() : '';
  const statusValue = typeof statusFilter === 'string' ? statusFilter.trim() : '';
  const limitValue = typeof limit === 'string' ? limit.trim() : '';
  if (searchValue) params.set('q', searchValue);
  if (statusValue) params.set('status', statusValue);
  if (limitValue) params.set('limit', limitValue);

  try {
    const adminUser = req.session?.user?.username || 'admin';
    const comment = (note || '').trim();
    const doc = await adminSetConsentStatus(userId, status, {
      channel: 'admin-portal',
      note: comment ? `${comment} (by ${adminUser})` : `manual update by ${adminUser}`,
      displayName: (displayName || '').trim() || undefined,
    });
    params.set('ok', '1');
    if (doc?.userId) params.set('user', doc.userId);
  } catch (err) {
    params.set('error', err?.message || String(err));
  }

  const query = params.toString();
  res.redirect(`/admin/consents${query ? `?${query}` : ''}`);
});

/* ------------------------------------------------------------------ */
/* Bot FAQ management                                                 */
/* ------------------------------------------------------------------ */

router.get('/bot-faq', requireAuth, async (req, res) => {
  await renderBotFaq(res, { message: req.query.msg || '' });
});

router.post('/bot-faq/new', requireAuth, async (req, res) => {
  try {
    const { title, intent, answer, keywords, suggestions, tags, priority } = req.body || {};

    const keywordList = splitListInput(keywords);
    if (!keywordList.length) {
      throw new Error('กรุณาระบุคำหลักอย่างน้อย 1 คำ');
    }

    const prepared = {
      title: String(title || '').trim() || keywordList[0],
      intent: String(intent || '').trim() || 'ทั่วไป',
      answer: String(answer || '').trim(),
      keywords: keywordList,
      suggestions: splitListInput(suggestions),
      tags: splitListInput(tags),
      priority: Number(priority) || 10,
      createdBy: req.session?.user?.username || 'admin',
      updatedBy: req.session?.user?.username || 'admin',
    };

    if (!prepared.answer) {
      throw new Error('กรุณากรอกคำตอบให้ครบถ้วน');
    }

    await BotFaq.create(prepared);
    invalidateBotFaqCache();
    res.redirect('/admin/bot-faq?msg=บันทึกแล้ว');
  } catch (err) {
    console.error('[ADMIN] create bot faq error:', err);
    await renderBotFaq(res, {
      error: err?.message || 'ไม่สามารถบันทึกได้',
      form: req.body,
    });
  }
});

router.post('/bot-faq/import-defaults', requireAuth, async (req, res) => {
  try {
    const result = await bulkInsertFaqs(faqSeed, { refreshCache: true });
    const inserted = result.inserted || 0;
    res.redirect(`/admin/bot-faq?msg=นำเข้าคำตอบ ${inserted} รายการ`);
  } catch (err) {
    console.error('[ADMIN] import bot faq error:', err);
    await renderBotFaq(res, {
      error: err?.message || 'ไม่สามารถนำเข้าชุดคำถามได้',
    });
  }
});

router.post('/bot-faq/:id/toggle', requireAuth, async (req, res) => {
  try {
    const doc = await BotFaq.findById(req.params.id);
    if (!doc) throw new Error('ไม่พบข้อมูล');
    doc.isActive = !doc.isActive;
    doc.updatedBy = req.session?.user?.username || doc.updatedBy;
    await doc.save();
    invalidateBotFaqCache();
    res.redirect('/admin/bot-faq?msg=อัปเดตสถานะแล้ว');
  } catch (err) {
    console.error('[ADMIN] toggle bot faq error:', err);
    await renderBotFaq(res, {
      error: err?.message || 'ไม่สามารถอัปเดตสถานะได้',
    });
  }
});

router.post('/bot-faq/:id/delete', requireAuth, async (req, res) => {
  try {
    await BotFaq.findByIdAndDelete(req.params.id);
    invalidateBotFaqCache();
    res.redirect('/admin/bot-faq?msg=ลบแล้ว');
  } catch (err) {
    console.error('[ADMIN] delete bot faq error:', err);
    await renderBotFaq(res, {
      error: err?.message || 'ไม่สามารถลบได้',
    });
  }
});

/* ------------------------------------------------------------------ */
/* Companies (CRUD)                                                    */
/* ------------------------------------------------------------------ */

router.get('/companies', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  res.render('companies', { companies, title: 'Companies', active: 'companies' });
});

router.get('/companies/new', requireAuth, (req, res) => {
  res.render('company_form', {
    action: 'สร้าง',
    company: { name: '', timezone: 'Asia/Bangkok', dailyTime: '09:00' },
    error: null,
    title: 'New Company',
    active: 'companies',
  });
});

router.post('/companies/new', requireAuth, async (req, res) => {
  const { name, timezone, dailyTime, sourceCompanyIds, sourceCompanyNames } = req.body || {};
  const idList = parseSourceList(sourceCompanyIds);
  const nameList = parseSourceList(sourceCompanyNames);
  try {
    await Company.create({
      name,
      timezone: timezone || 'Asia/Bangkok',
      dailyTime: dailyTime || '09:00',
      sourceCompanyIds: idList,
      sourceCompanyNames: nameList,
    });
    res.redirect('/admin/companies');
  } catch (err) {
    res.render('company_form', {
      action: 'สร้าง',
      company: { name, timezone, dailyTime, sourceCompanyIds: idList, sourceCompanyNames: nameList },
      error: err.message || String(err),
      title: 'New Company',
      active: 'companies',
    });
  }
});

router.get('/companies/:id/edit', requireAuth, async (req, res) => {
  const c = await Company.findById(req.params.id).lean();
  if (!c) return res.redirect('/admin/companies');
  res.render('company_form', { action: 'แก้ไข', company: c, error: null, title: 'Edit Company', active: 'companies' });
});

router.post('/companies/:id/edit', requireAuth, async (req, res) => {
  const { name, timezone, dailyTime, sourceCompanyIds, sourceCompanyNames } = req.body || {};
  const idList = parseSourceList(sourceCompanyIds);
  const nameList = parseSourceList(sourceCompanyNames);
  try {
    await Company.findByIdAndUpdate(req.params.id, {
      name,
      timezone,
      dailyTime,
      sourceCompanyIds: idList,
      sourceCompanyNames: nameList,
    }, { runValidators: true });
    res.redirect('/admin/companies');
  } catch (err) {
    const c = await Company.findById(req.params.id).lean();
    res.render('company_form', {
      action: 'แก้ไข',
      company: { ...(c || {}), name, timezone, dailyTime, sourceCompanyIds: idList, sourceCompanyNames: nameList },
      error: err.message || String(err),
      title: 'Edit Company',
      active: 'companies',
    });
  }
});

router.post('/companies/:id/delete', requireAuth, async (req, res) => {
  await Company.findByIdAndDelete(req.params.id);
  res.redirect('/admin/companies');
});

/* ------------------------------------------------------------------ */
/* Members (CRUD)                                                      */
/* ------------------------------------------------------------------ */

router.get('/members', requireAuth, async (req, res) => {
  const members = await Member.find().populate('companyId').lean();
  const companies = await Company.find().lean();
  res.render('members', { members, companies, title: 'Members', active: 'members' });
});

router.get('/members/new', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  res.render('member_form', {
    action: 'สร้าง',
    companies,
    m: { companyId: companies[0]?._id?.toString() || '', lineUserId: '', displayName: '', role: 'member', active: true },
    error: null,
    title: 'New Member',
    active: 'members',
  });
});

router.post('/members/new', requireAuth, async (req, res) => {
  const { companyId, lineUserId, displayName, role, active, bindCode } = req.body || {};
  try {
    await Member.create({
      companyId: companyId || null,
      lineUserId: (lineUserId || '').trim() || null,
      displayName: (displayName || '').trim(),
      role: role || 'member',
      active: active === 'on',
      bindCode: (bindCode || '').trim(),
    });
    res.redirect('/admin/members');
  } catch (err) {
    const companies = await Company.find().lean();
    res.render('member_form', {
      action: 'สร้าง',
      companies,
      m: { companyId, lineUserId, displayName, role, active: active === 'on', bindCode },
      error: err.message || String(err),
      title: 'New Member',
      active: 'members',
    });
  }
});

router.get('/members/:id/edit', requireAuth, async (req, res) => {
  const m = await Member.findById(req.params.id).lean();
  if (!m) return res.redirect('/admin/members');
  const companies = await Company.find().lean();
  res.render('member_form', { action: 'แก้ไข', companies, m, error: null, title: 'Edit Member', active: 'members' });
});

router.post('/members/:id/edit', requireAuth, async (req, res) => {
  const { companyId, lineUserId, displayName, role, active, bindCode } = req.body || {};
  try {
    await Member.findByIdAndUpdate(req.params.id, {
      companyId: companyId || null,
      lineUserId: (lineUserId || '').trim() || null,
      displayName: (displayName || '').trim(),
      role: role || 'member',
      active: active === 'on',
      bindCode: (bindCode || '').trim(),
    });
    res.redirect('/admin/members');
  } catch (err) {
    const m = await Member.findById(req.params.id).lean();
    const companies = await Company.find().lean();
    res.render('member_form', { action: 'แก้ไข', companies, m, error: err.message || String(err), title: 'Edit Member', active: 'members' });
  }
});

router.post('/members/:id/delete', requireAuth, async (req, res) => {
  await Member.findByIdAndDelete(req.params.id);
  res.redirect('/admin/members');
});

/* ------------------------------------------------------------------ */
/* Members Map (Link LINE user ↔ Company)                              */
/* ------------------------------------------------------------------ */

// ทางลัดเมนู
router.get('/link', requireAuth, (req, res) => res.redirect('/admin/members/link'));
router.get('/line', requireAuth, (req, res) => res.redirect('/admin/members/link'));

// หน้า Map รายชื่อ
router.get('/members/link', requireAuth, async (req, res) => {
  const { q = '', unlinked = '1', msg = '' } = req.query || {};
  const companies = await Company.find().lean();

  const cond = {};
  if (unlinked === '1') {
    // เอาทั้งกรณีฟิลด์หาย ($exists:false) และฟิลด์มีแต่เป็น null
    cond.$or = [{ companyId: null }, { companyId: { $exists: false } }];
  }

  if (q) {
    cond.$or = [
      ...(cond.$or || []),
      { displayName: { $regex: q, $options: 'i' } },
      { lineUserId: { $regex: q, $options: 'i' } },
    ];
  }

  const members = await Member.find(cond).sort({ createdAt: -1 }).lean();
  const countAll = await Member.countDocuments({});
  const countUnlinked = await Member.countDocuments({ $or: [{ companyId: null }, { companyId: { $exists: false } }] });

  res.render('members_link', {
    companies,
    members,
    q,
    unlinked: unlinked === '1',
    counters: { all: countAll, unlinked: countUnlinked },
    msg,
    title: 'Link LINE Users to Companies',
    active: 'link',
  });
});

// บันทึกการ map แบบ bulk
router.post('/members/link', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body.memberId) ? req.body.memberId : [req.body.memberId].filter(Boolean);
  const comps = Array.isArray(req.body.companyId) ? req.body.companyId : [req.body.companyId].filter(Boolean);
  const actives = new Set(
    (Array.isArray(req.body.active) ? req.body.active : [req.body.active]).filter(Boolean).map(String)
  );

  let updated = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const companyId = (comps[i] || '').trim();
    const active = actives.has(String(i));
    if (!id) continue;
    await Member.updateOne(
      { _id: id },
      { $set: { companyId: companyId || null, active } }
    );
    updated++;
  }
  return res.redirect('/admin/members/link?msg=' + encodeURIComponent(`บันทึกแล้ว ${updated} รายการ`));
});

// ดึงโปรไฟล์จาก LINE แล้วอัปเดตชื่อ
router.post('/members/:id/refresh-profile', requireAuth, async (req, res) => {
  const m = await Member.findById(req.params.id);
  if (!m) return res.redirect('/admin/members/link?msg=' + encodeURIComponent('ไม่พบสมาชิก'));
  try {
    const p = await getUserProfile(m.lineUserId);
    await Member.updateOne({ _id: m._id }, {
      $set: {
        displayName: p?.displayName || m.displayName || '',
        pictureUrl: p?.pictureUrl || '',
        statusMessage: p?.statusMessage || '',
      }
    });
    return res.redirect('/admin/members/link?msg=' + encodeURIComponent('อัปเดตโปรไฟล์เรียบร้อย'));
  } catch (e) {
    return res.redirect('/admin/members/link?msg=' + encodeURIComponent('ดึงโปรไฟล์ล้มเหลว: ' + (e?.message || e)));
  }
});

/* ------------------------------------------------------------------ */
/* Keywords (CRUD)                                                     */
/* ------------------------------------------------------------------ */

router.get('/keywords', requireAuth, async (req, res) => {
  const keywords = await Keyword.find().lean();
  res.render('keywords', { keywords, form: null, error: null, title: 'Keywords', active: 'keywords' });
});

router.post('/keywords/new', requireAuth, async (req, res) => {
  const { keyword, replyType, replyText, templateCode } = req.body || {};
  try {
    await Keyword.create({
      keyword: (keyword || '').trim(),
      replyType: replyType || 'text',
      replyText: replyText || '',
      templateCode: templateCode || '',
    });
    res.redirect('/admin/keywords');
  } catch (err) {
    const keywords = await Keyword.find().lean();
    res.render('keywords', { keywords, error: err.message || String(err), form: req.body, title: 'Keywords', active: 'keywords' });
  }
});

router.post('/keywords/:id/delete', requireAuth, async (req, res) => {
  await Keyword.findByIdAndDelete(req.params.id);
  res.redirect('/admin/keywords');
});

/* ------------------------------------------------------------------ */
/* Rich Menu (Admin)                                                   */
/* ------------------------------------------------------------------ */

router.get('/richmenu', requireAuth, async (req, res) => {
  let list = [];
  let result = null;
  try {
    list = await getRichMenuList().catch(() => []);
    if (req.query.msg) result = { ok: true, message: req.query.msg };
  } catch (e) {
    result = { error: e?.message || String(e) };
  }
  res.render('richmenu', { list, result, title: 'Rich Menu', active: 'richmenu' });
});

router.get('/richmenu/debug', requireAuth, async (req, res) => {
  try {
    const info = await getBotInfo();
    const list = await getRichMenuList();
    let imageOk = null;
    if (list[0]?.richMenuId) {
      try {
        imageOk = await checkRichMenuImageExists(list[0].richMenuId);
      } catch (e) {
        imageOk = `error: ${e?.message || e}`;
      }
    }
    const result = {
      ok: true,
      message: JSON.stringify({ info, count: list.length, firstHasImage: imageOk }, null, 2),
    };
    res.render('richmenu', { list, result, title: 'Rich Menu', active: 'richmenu' });
  } catch (e) {
    res.render('richmenu', { list: [], result: { error: e?.message || String(e) }, title: 'Rich Menu', active: 'richmenu' });
  }
});

router.post('/richmenu/create', requireAuth, async (req, res) => {
  let list = [];
  try {
    const cfg = (function buildMenuConfigFull() {
      const colW = [834, 833, 833];
      const rowH = [843, 843];
      const x = [0, colW[0], colW[0] + colW[1]];
      const y = [0, rowH[0]];
      const BASE_URL = ((process.env.BASE_URL || 'https://example.com')).replace(/\/$/, '');
      const areas = [
        // Top row
        { bounds:{ x:x[0], y:y[0], width:colW[0], height:rowH[0] }, action: { type:'message', text:'สรุป วันนี้' }, label:'รายงานวันนี้' },
        { bounds:{ x:x[1], y:y[0], width:colW[1], height:rowH[0] }, action: { type:'message', text:'สรุป' },        label:'เลือกรายงาน' },
        { bounds:{ x:x[2], y:y[0], width:colW[2], height:rowH[0] }, action: { type:'message', text:'สถานะ' },       label:'ล่าสุด' },
        // Bottom row
        { bounds:{ x:x[0], y:y[1], width:colW[0], height:rowH[1] }, action: { type:'uri', uri: `${BASE_URL}/liff-open-admin?to=/admin` }, label:'ตั้งค่า' },
        { bounds:{ x:x[1], y:y[1], width:colW[1], height:rowH[1] }, action: { type:'uri', uri: `${BASE_URL}/auth/line/start?redirect=/admin` }, label:'เชื่อมต่อบริษัท' },
        { bounds:{ x:x[2], y:y[1], width:colW[2], height:rowH[1] }, action: { type:'postback', data:'CONTACT_US', displayText:'ติดต่อเรา' }, label:'ติดต่อเรา' },
      ];
      return {
        size: { width: 2500, height: 1686 },
        selected: true,
        name: 'NILA_FULL_3x2',
        chatBarText: 'เมนู',
        areas: areas.map(a => ({ bounds: a.bounds, action: a.action })),
      };
    })();

    const id = await createRichMenu(cfg);

    const imgPath = path.join(__dirname, '..', 'assets', 'richmenu.jpg');
    try {
      const stat = fs.statSync(imgPath);
      console.log(`[RICHMENU] using image ${imgPath} (${stat.size} bytes)`);
    } catch {
      return res.render('richmenu', { list: [], result: { error: `ไม่พบไฟล์รูปที่ ${imgPath}` }, title: 'Rich Menu', active: 'richmenu' });
    }
    await uploadRichMenuImage(id, imgPath);

    // รอรูปพร้อม แล้วค่อยตั้ง default
    for (const wait of [400, 800, 1500]) {
      const ok = await checkRichMenuImageExists(id).catch(() => false);
      if (ok) break;
      await new Promise(r => setTimeout(r, wait));
    }

    await setDefaultRichMenu(id);

    list = await getRichMenuList();
    return res.render('richmenu', {
      list,
      result: { ok: true, message: `สร้าง & อัปโหลดรูป & ตั้ง default สำเร็จ (id=${id})` },
      title: 'Rich Menu',
      active: 'richmenu',
    });
  } catch (e) {
    console.error('[RICHMENU ERROR]', e?.response?.status, e);
    list = await getRichMenuList().catch(() => []);
    return res.render('richmenu', {
      list,
      result: { error: e?.message || String(e) },
      title: 'Rich Menu',
      active: 'richmenu',
    });
  }
});

router.post('/richmenu/default', requireAuth, async (req, res) => {
  try {
    await setDefaultRichMenu(req.body.id);
    res.redirect('/admin/richmenu?msg=' + encodeURIComponent(`ตั้ง ${req.body.id} เป็น Default แล้ว`));
  } catch (e) {
    res.redirect('/admin/richmenu?msg=' + encodeURIComponent('ตั้ง Default ล้มเหลว: ' + (e?.message || e)));
  }
});

router.post('/richmenu/delete', requireAuth, async (req, res) => {
  try {
    const id = (req.body.id || '').trim();
    if (id) {
      await deleteRichMenu(id);
      return res.redirect('/admin/richmenu?msg=' + encodeURIComponent(`ลบ ${id} แล้ว`));
    }
    const list = await getRichMenuList();
    for (const m of list) await deleteRichMenu(m.richMenuId);
    return res.redirect('/admin/richmenu?msg=' + encodeURIComponent('ลบทั้งหมดแล้ว'));
  } catch (e) {
    return res.redirect('/admin/richmenu?msg=' + encodeURIComponent('ลบล้มเหลว: ' + (e?.message || e)));
  }
});

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

router.get('/upload', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  res.render('upload', { companies, resultHtml: null, title: 'Upload', active: 'upload' });
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  const companies = await Company.find().lean();
  const isAjax = req.xhr || /application\/json/.test(String(req.headers.accept || ''));

  console.log('[UPLOAD] body', req.body);
  if (req.file) console.log('[UPLOAD] file', { name: req.file.originalname, size: req.file.size });

  if (!req.file) {
    if (isAjax) {
      return res.status(400).json({ ok: false, error: 'กรุณาแนบไฟล์ Excel' });
    }
    const resultHtml = await renderUploadResultPartial(res, { error: 'กรุณาแนบไฟล์ Excel' });
    return res.render('upload', { companies, resultHtml, title: 'Upload', active: 'upload' });
  }

  try {
    const { rowsAll, rowsMix, dateRange } = parseExcel(req.file.buffer);
    console.log('[UPLOAD] parseExcel -> rowsAll=%d rowsMix=%d range=', rowsAll.length, rowsMix.length, dateRange);
    if (rowsAll[0]) console.log({ sampleRow: rowsAll[0] });
    if (rowsMix[0]) console.log({ sampleMix: rowsMix[0] });

    const sourceIdSet = new Set();
    const sourceNameSet = new Set();
    for (const row of rowsAll) {
      if (row?.sourceCompanyId) sourceIdSet.add(row.sourceCompanyId);
      if (row?.sourceCompanyName) sourceNameSet.add(row.sourceCompanyName);
    }
    const sourceCompanyIds = Array.from(sourceIdSet);
    const sourceCompanyNames = Array.from(sourceNameSet);

    const sourceClauses = [];
    if (sourceCompanyIds.length) sourceClauses.push({ sourceCompanyId: { $in: sourceCompanyIds } });
    if (sourceCompanyNames.length) sourceClauses.push({ sourceCompanyName: { $in: sourceCompanyNames } });
    const sourceMatch =
      sourceClauses.length === 0
        ? null
        : sourceClauses.length === 1
          ? sourceClauses[0]
          : { $or: sourceClauses };

    // purge by date range (ล้างเฉพาะช่วงที่จะ import)
    let cleared = 0;
    if (req.body.clearExisting && sourceMatch && (dateRange.minDate || dateRange.maxDate)) {
      const dateCond = {};
      if (dateRange.minDate) dateCond.$gte = dateRange.minDate;
      if (dateRange.maxDate) dateCond.$lte = dateRange.maxDate;

      if (Object.keys(dateCond).length) {
        const q = { dateStr: dateCond };
        if (sourceMatch.$or) q.$or = sourceMatch.$or;
        else Object.assign(q, sourceMatch);

        const del = await Record.deleteMany(q);
        cleared = del.deletedCount || 0;
        console.log('[UPLOAD] cleared existing', { query: q, deleted: cleared });
      }
    }

    const tidy = (value) => String(value ?? '').trim();
    const equalsIgnoreCase = (a, b) => tidy(a).toLowerCase() === tidy(b).toLowerCase();
    const companyMatchers = companies.map((c) => ({
      id: c._id,
      name: tidy(c.name),
      ids: (c.sourceCompanyIds || []).map(tidy).filter(Boolean),
      names: (c.sourceCompanyNames || []).map(tidy).filter(Boolean),
    }));
    const fallbackSourceName = sourceCompanyNames.length === 1 ? tidy(sourceCompanyNames[0]) : '';
    const fallbackSourceId = sourceCompanyIds.length === 1 ? tidy(sourceCompanyIds[0]) : '';
    const resolveCompanyFromSource = (sourceId, sourceName) => {
      const idNorm = tidy(sourceId);
      const nameNorm = tidy(sourceName);
      if (idNorm) {
        const found = companyMatchers.find((item) =>
          item.ids.some((candidate) => equalsIgnoreCase(candidate, idNorm))
        );
        if (found) return found;
      }
      if (nameNorm) {
        let found = companyMatchers.find((item) =>
          item.names.some((candidate) => equalsIgnoreCase(candidate, nameNorm))
        );
        if (found) return found;
        found = companyMatchers.find((item) => equalsIgnoreCase(item.name, nameNorm));
        if (found) return found;
      }
      return null;
    };
    const parseNumericLoose = (input) => {
      const raw = tidy(input).replace(/,/g, '');
      if (!raw) return 0;
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber)) return asNumber;
      const match = raw.match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : 0;
    };
    const weightToTons = (weightInput, unitInput) => {
      const weight = parseNumericLoose(weightInput);
      if (!weight) return 0;
      const unit = tidy(unitInput).toUpperCase();
      if (!unit) return weight > 2000 ? weight / 1000 : weight;
      if (/กก|กิโล|KG|KILO/.test(unit)) return weight / 1000;
      if (/ตัน|TON/.test(unit)) return weight;
      return weight > 2000 ? weight / 1000 : weight;
    };
    const pad2 = (num) => String(Math.max(0, Number(num) || 0)).padStart(2, '0');
    const normaliseYear = (value) => {
      let year = Number(value);
      if (!Number.isFinite(year)) return null;
      if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
      if (year < 100) {
        year += year >= 70 ? 1900 : 2000;
      }
      return year;
    };
    const MONTH_MAP = new Map([
      ['jan', 1], ['january', 1],
      ['feb', 2], ['february', 2],
      ['mar', 3], ['march', 3],
      ['apr', 4], ['april', 4],
      ['may', 5],
      ['jun', 6], ['june', 6],
      ['jul', 7], ['july', 7],
      ['aug', 8], ['august', 8],
      ['sep', 9], ['sept', 9], ['september', 9],
      ['oct', 10], ['october', 10],
      ['nov', 11], ['november', 11],
      ['dec', 12], ['december', 12],
      ['ม.ค.', 1], ['มกราคม', 1],
      ['ก.พ.', 2], ['กุมภาพันธ์', 2],
      ['มี.ค.', 3], ['มีนาคม', 3],
      ['เม.ย.', 4], ['เมษายน', 4],
      ['พ.ค.', 5], ['พฤษภาคม', 5],
      ['มิ.ย.', 6], ['มิถุนายน', 6],
      ['ก.ค.', 7], ['กรกฎาคม', 7],
      ['ส.ค.', 8], ['สิงหาคม', 8],
      ['ก.ย.', 9], ['กันยายน', 9],
      ['ต.ค.', 10], ['ตุลาคม', 10],
      ['พ.ย.', 11], ['พฤศจิกายน', 11],
      ['ธ.ค.', 12], ['ธันวาคม', 12],
    ]);
    const monthWordToNumber = (word) => {
      if (!word) return null;
      const normalized = word.toLowerCase().replace(/\./g, '').trim();
      if (MONTH_MAP.has(word)) return MONTH_MAP.get(word);
      return MONTH_MAP.get(normalized) || null;
    };
    const tryMonthWordDate = (value) => {
      const str = tidy(value);
      if (!str) return '';
      const match = str.match(/(\d{1,2})\s*([A-Za-z\u0E00-\u0E7F\.]+)\s*(\d{2,4})/);
      if (!match) return '';
      const [, dayRaw, monthRaw, yearRaw] = match;
      const monthNum = monthWordToNumber(monthRaw);
      if (!monthNum) return '';
      const year = normaliseYear(yearRaw);
      if (!year) return '';
      return `${year}-${pad2(monthNum)}-${pad2(dayRaw)}`;
    };
    const normaliseMixDateValue = (value) => {
      if (value === undefined || value === null) return '';
      if (value instanceof Date) return dayjs(value).format('YYYY-MM-DD');
      if (typeof value === 'number' && Number.isFinite(value)) return excelDateToYMD(value);
      let str = tidy(value)
        .replace(/\u200B+/g, '') // zero-width space
        .replace(/\s+/g, ' ')
        .trim();
      if (!str) return '';

      // Replace Thai/English month words → numeric
      const monthWordIso = tryMonthWordDate(str);
      if (monthWordIso) return monthWordIso;

      // Adjust Buddhist year if present in yyyy-mm-dd form
      str = str.replace(/(\b\d{4}\b)/, (match) => {
        const year = normaliseYear(match);
        return year ? String(year) : match;
      });

      const variants = new Set([str]);
      const replacedT = str.includes('T') ? str.replace('T', ' ') : str;
      variants.add(replacedT);
      const withoutComma = str.includes(',') ? str.replace(/,/g, ' ') : str;
      variants.add(withoutComma);
      variants.forEach((variant) => {
        const parts = tidy(variant).split(' ');
        if (parts.length > 1) {
          variants.add(parts[0]);
        }
        const slash = variant.replace(/\./g, '-').replace(/\//g, '-');
        variants.add(slash);
      });

      for (const candidate of variants) {
        const iso = excelDateToYMD(candidate);
        if (iso) return iso;
        const parsed = dayjs(candidate);
        if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
        const match = candidate.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
        if (match) {
          const [, d, m, y] = match;
          const year = normaliseYear(y);
          if (year) return `${year}-${pad2(m)}-${pad2(d)}`;
        }
      }
      return '';
    };
    const parseMixDateStr = (row) => {
      const fields = [
        row.outTime,
        row.OutTime,
        row['Out Time'],
        row.out_time,
        row.outTime_TH,
        row.OutTime_TH,
        row['outTime_TH'],
        row.out_time_th,
        row.outDate,
        row.OutDate,
        row['OUT DATE'],
        row['Out Date'],
        row['out_date'],
        row.dateStr,
        row.date,
        row.Date,
        row.createdAt,
        row.updatedAt,
        row.timestamp,
        row.Timestamp,
        row['TimeStamp'],
        row['timeStamp'],
        row.weighTime,
        row.WeighTime,
        row['WEIGH TIME'],
        row['วันที่'],
        row['วันเวลา'],
        row['วัน-เวลา'],
        row['วัน\u200B เวลา'],
      ];
      for (const value of fields) {
        const iso = normaliseMixDateValue(value);
        if (iso) return iso;
      }
      return '';
    };

    // upsert mix map
    let mapsUpserted = 0;
    const mixAggregateMap = new Map();
    const mixAggregateScope = {
      companyIds: new Set(),
      sourceIds: new Set(),
      sourceNames: new Set(),
      dates: new Set(),
    };
    for (const m of rowsMix) {
      const rawCode = tidy(m.code || m.Code || m['รหัส'] || m.codeMix || m['Code']);
      const code = rawCode ? rawCode.toUpperCase() : '';

      const projectName = tidy(
        m.projectName || m.ProjectName || m['Project Name'] ||
        m['PROJECT NAME'] || m['ชื่อโครงการ'] || m['ชื่องาน'] ||
        m.name || m.Name
      );
      const mixName = tidy(
        m.mixName || m.MixName || m['Mix Name'] || m['MIX NAME'] ||
        m.jobMix || m.JobMix || m['Job Mix'] || m['JOB MIX']
      );
      let mixCompanyId = tidy(m.companyId || m.CompanyId || m.COMPANYID);
      let mixCompanyName = tidy(m.companyName || m.CompanyName || m['บริษัท'] || m['บริษัท/หน่วยงาน']);
      if (!mixCompanyId && fallbackSourceId) mixCompanyId = fallbackSourceId;
      if (!mixCompanyName && fallbackSourceName) mixCompanyName = fallbackSourceName;

      const matchedCompany = resolveCompanyFromSource(mixCompanyId, mixCompanyName);
      if (!mixCompanyId && !mixCompanyName && !matchedCompany) continue;

      const mixDateStr = parseMixDateStr(m);
      if (!mixDateStr) continue;
      if (code) {
        const lookupClauses = [];
        if (mixCompanyId) lookupClauses.push({ sourceCompanyId: mixCompanyId, code });
        if (mixCompanyName) lookupClauses.push({ sourceCompanyName: mixCompanyName, code });
        if (matchedCompany) lookupClauses.push({ companyId: matchedCompany.id, code });

        let mixDoc = lookupClauses.length
          ? await MixMap.findOne({ $or: lookupClauses })
          : null;
        if (!mixDoc) {
          mixDoc = new MixMap({ code });
        }

        let changed = false;
        if ((mixDoc.code || '') !== code) {
          mixDoc.code = code;
          changed = true;
        }
        const resolvedProjectName = projectName || mixDoc.name || mixName;
        if ((mixDoc.name || '') !== (resolvedProjectName || '')) {
          mixDoc.name = resolvedProjectName || '';
          changed = true;
        }
        const resolvedMixName = mixName || '';
        if ((mixDoc.mixName || '') !== resolvedMixName) {
          mixDoc.mixName = resolvedMixName;
          changed = true;
        }
        const resolvedSourceId = mixCompanyId || '';
        if ((mixDoc.sourceCompanyId || '') !== resolvedSourceId) {
          mixDoc.sourceCompanyId = resolvedSourceId;
          changed = true;
        }
        const resolvedSourceName = mixCompanyName || (matchedCompany ? matchedCompany.name : '') || '';
        if ((mixDoc.sourceCompanyName || '') !== resolvedSourceName) {
          mixDoc.sourceCompanyName = resolvedSourceName;
          changed = true;
        }
        if (matchedCompany) {
          const currentId = mixDoc.companyId ? mixDoc.companyId.toString() : '';
          if (currentId !== matchedCompany.id.toString()) {
            mixDoc.companyId = matchedCompany.id;
            changed = true;
          }
        }

        if (changed) {
          await mixDoc.save();
          mapsUpserted += 1;
        }
      }

      const displayName = tidy(m.name || m.Name || projectName || mixName || code);
      const netWeightRaw =
        m.netWeight ?? m.NetWeight ?? m['Net Weight'] ?? m['NET WEIGHT'] ??
        m.net_weight ?? m.Net_weight ?? m['น้ำหนักสุทธิ'] ?? m['น้ำหนักสุทธิ (ตัน)'];
      const unitRaw =
        m.unit ?? m.Unit ?? m.UNIT ?? m['Unit'] ?? m['หน่วย'] ?? m['UNIT'];
      const netWeightTons = weightToTons(netWeightRaw, unitRaw);

      if (netWeightTons > 0 && displayName) {
        const key = `${mixDateStr}::${displayName}::${code}`;
        if (matchedCompany?.id) {
          mixAggregateScope.companyIds.add(matchedCompany.id.toString());
        }
        if (mixCompanyId) mixAggregateScope.sourceIds.add(mixCompanyId);
        if (mixCompanyName) mixAggregateScope.sourceNames.add(mixCompanyName);
        mixAggregateScope.dates.add(mixDateStr);

        const current = mixAggregateMap.get(key) || {
          projectName: displayName,
          mixName: mixName || '',
          projectCode: code || '',
          totalNetWeightTons: 0,
          entryCount: 0,
          sourceCompanyId: '',
          sourceCompanyName: '',
          companyId: null,
          dateStr: mixDateStr,
        };
        current.totalNetWeightTons += netWeightTons;
        current.entryCount += 1;
        if (!current.mixName && mixName) current.mixName = mixName;
        if (!current.projectCode && code) current.projectCode = code;
        if (!current.sourceCompanyId && mixCompanyId) current.sourceCompanyId = mixCompanyId;
        if (!current.sourceCompanyName && mixCompanyName) current.sourceCompanyName = mixCompanyName;
        if (!current.companyId && matchedCompany?.id) current.companyId = matchedCompany.id;
        current.dateStr = mixDateStr;
        mixAggregateMap.set(key, current);
      }
    }
    if (rowsMix.length) console.log('[UPLOAD] mix upserted', mapsUpserted);

    let mixAggregatesUpserted = 0;
    if (mixAggregateMap.size) {
      await MixAggregate.deleteMany({ dateStr: { $exists: false } });
      const mixAggregateDocs = Array.from(mixAggregateMap.values()).map((entry) => {
        const doc = {
          projectName: entry.projectName,
          mixName: entry.mixName,
          projectCode: entry.projectCode,
          totalNetWeightTons: Number(entry.totalNetWeightTons.toFixed(3)),
          entryCount: entry.entryCount,
          dateStr: entry.dateStr,
        };
        if (entry.companyId) doc.companyId = entry.companyId;
        if (entry.sourceCompanyId) doc.sourceCompanyId = entry.sourceCompanyId;
        if (entry.sourceCompanyName) doc.sourceCompanyName = entry.sourceCompanyName;
        return doc;
      });

      const deleteClauses = [];
      const companyIdList = Array.from(mixAggregateScope.companyIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (companyIdList.length) {
        deleteClauses.push({ companyId: { $in: companyIdList.map((id) => new mongoose.Types.ObjectId(id)) } });
      }
      const sourceIdList = Array.from(mixAggregateScope.sourceIds).filter(Boolean);
      if (sourceIdList.length) deleteClauses.push({ sourceCompanyId: { $in: sourceIdList } });
      const sourceNameList = Array.from(mixAggregateScope.sourceNames).filter(Boolean);
      if (sourceNameList.length) deleteClauses.push({ sourceCompanyName: { $in: sourceNameList } });
      const dateList = Array.from(mixAggregateScope.dates).filter(Boolean);

      let deleteFilter = null;
      if (deleteClauses.length === 1) {
        deleteFilter = { ...deleteClauses[0] };
        if (dateList.length) deleteFilter.dateStr = { $in: dateList };
      } else if (deleteClauses.length > 1) {
        const andClauses = [];
        if (dateList.length) andClauses.push({ dateStr: { $in: dateList } });
        andClauses.push({ $or: deleteClauses });
        deleteFilter = { $and: andClauses };
      } else if (dateList.length) {
        deleteFilter = { dateStr: { $in: dateList } };
      }

      if (deleteFilter) await MixAggregate.deleteMany(deleteFilter);
      await MixAggregate.insertMany(mixAggregateDocs, { ordered: false });
      mixAggregatesUpserted = mixAggregateDocs.length;
      console.log('[UPLOAD] mix aggregates refreshed', { count: mixAggregatesUpserted });
    }

    // import records (bulk-upsert by rowHash)
    const resultBulk = await importRecords(rowsAll);
    console.log('[UPLOAD] bulkWrite =>', resultBulk);

    // show what dates exist after import (ตามรหัสบริษัทต้นทาง)
    const matchRecent = { dateStr: { $type: 'string' } };
    if (sourceMatch) {
      if (sourceMatch.$or) matchRecent.$or = sourceMatch.$or;
      else Object.assign(matchRecent, sourceMatch);
    }

    const recentDates = await Record.aggregate([
      { $match: matchRecent },
      { $group: { _id: '$dateStr', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 200 },
      { $project: { _id: 0, dateStr: '$_id', count: 1 } }
    ]);
    const sample = await Record.findOne(matchRecent).sort({ createdAt: -1 }).lean();
    console.log('[UPLOAD][AFTER IMPORT][DATES]', recentDates);
    console.log('[UPLOAD][AFTER IMPORT][SAMPLE]', sample);

    // stats for view
    const stats = buildStatsForView(rowsAll);
    const parsedStats = summarizeImported(rowsAll);

    const sourceSummary = Array.from(
      rowsAll.reduce((map, row) => {
        const key = row.sourceCompanyId || row.sourceCompanyName || 'ไม่ระบุ';
        const entry = map.get(key) || {
          sourceCompanyId: row.sourceCompanyId || '',
          sourceCompanyName: row.sourceCompanyName || (row.sourceCompanyId ? '' : 'ไม่ระบุ'),
          rows: 0,
          totalTons: 0,
        };
        entry.rows += 1;
        entry.totalTons += Number(row.weightTons || 0);
        if (!entry.sourceCompanyName && row.sourceCompanyName) {
          entry.sourceCompanyName = row.sourceCompanyName;
        }
        map.set(key, entry);
        return map;
      }, new Map()).values()
    ).map((item) => ({
      ...item,
      totalTonsFormatted: Number(item.totalTons || 0).toLocaleString('th-TH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }),
    }));

    const resultPayload = {
      ok: true,
      cleared,
      inserted: resultBulk.inserted,
      range: dateRange,
      stats,
      parsedStats,
      recentDates,
      sourceSummary,
      sourceCompanyIds,
      sourceCompanyNames,
      mixAggregatesUpserted,
    };

    const resultHtml = await renderUploadResultPartial(res, resultPayload);

    if (isAjax) {
      return res.json({ ok: true, html: resultHtml });
    }

    return res.render('upload', {
      companies,
      resultHtml,
      title: 'Upload',
      active: 'upload',
    });
  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    if (isAjax) {
      return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
    const resultHtml = await renderUploadResultPartial(res, { error: err.message || String(err) });
    return res.render('upload', { companies, resultHtml, title: 'Upload', active: 'upload' });
  }
});

async function renderUploadResultPartial(res, result) {
  return await new Promise((resolve, reject) => {
    res.render('partials/upload_result', { result }, (err, html) => {
      if (err) return reject(err);
      resolve(html);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tools: Purge / Send Daily                                           */
/* ------------------------------------------------------------------ */

router.get('/tools', requireAuth, (req, res) => res.redirect('/admin/tools/purge'));

router.get('/tools/purge', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  res.render('tools/purge', { companies, result: null, form: req.query || {}, error: null, title: 'Purge', active: 'tools' });
});

router.post('/tools/purge', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  const { companyId, dateFrom, dateTo, wipeAll, confirmText } = req.body || {};

  if (String(wipeAll) === '1') {
    if (confirmText !== 'Delete') {
      return res.render('tools/purge', {
        companies,
        result: { error: 'กรุณาพิมพ์ Delete เพื่อยืนยันการลบทั้งหมด' },
        form: req.body,
        error: null,
        title: 'Purge',
        active: 'tools',
      });
    }
    try {
      const del = await Record.deleteMany({});
      return res.render('tools/purge', {
        companies,
        form: {},
        result: { ok: true, deleted: del.deletedCount, note: 'ล้างข้อมูลทั้งหมดสำเร็จ' },
        error: null,
        title: 'Purge',
        active: 'tools',
      });
    } catch (err) {
      console.error('[PURGE-ALL ERROR]', err);
      return res.render('tools/purge', {
        companies,
        result: { error: err.message || String(err) },
        form: req.body,
        error: null,
        title: 'Purge',
        active: 'tools',
      });
    }
  }

  if (!companyId || !dateFrom || !dateTo) {
    return res.render('tools/purge', {
      companies,
      result: { error: 'กรุณาเลือกบริษัท และช่วงวันที่' },
      form: req.body,
      error: null,
      title: 'Purge',
      active: 'tools',
    });
  }
  try {
    const cid = new mongoose.Types.ObjectId(companyId);
    const q = { companyId: cid, dateStr: { $gte: dateFrom, $lte: dateTo } };
    const del = await Record.deleteMany(q);
    return res.render('tools/purge', {
      companies,
      form: req.body,
      result: { ok: true, deleted: del.deletedCount },
      error: null,
      title: 'Purge',
      active: 'tools',
    });
  } catch (err) {
    console.error('[PURGE ERROR]', err);
    return res.render('tools/purge', {
      companies,
      result: { error: err.message || String(err) },
      form: req.body,
      error: null,
      title: 'Purge',
      active: 'tools',
    });
  }
});

router.get('/tools/send-daily', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  const defaultCompanyId = companies[0]?._id?.toString() || '';
  const selectedCompanyId = String(req.query.companyId || defaultCompanyId);
  const members = selectedCompanyId
    ? await Member.find({ companyId: selectedCompanyId, active: true }).lean()
    : [];
  res.render('tools/send_daily', {
    companies,
    members,
    result: null,
    form: { companyId: selectedCompanyId, date: dayjs().format('YYYY-MM-DD'), to: '' },
    title: 'Send Daily (Manual)',
    active: 'tools',
  });
});

// Tools: Mock records (BUY/SELL) generator
router.get('/tools/mock-records', requireAuth, async (req, res) => {
  res.render('tools/mock_records', {
    title: 'Mock Records',
    active: 'tools',
    result: null,
    form: { sinceDays: 14 },
  });
});

router.post('/tools/mock-records', requireAuth, async (req, res) => {
  const { action, sinceDays } = req.body || {};
  try {
    if (action === 'backfill') {
      await backfillMockUntilTodayAllCompanies({ sinceDays: Number(sinceDays || 14) });
      return res.render('tools/mock_records', {
        title: 'Mock Records', active: 'tools',
        form: { sinceDays },
        result: { ok: true, message: `Backfill สำเร็จย้อนหลัง ${sinceDays || 14} วัน` },
      });
    }
    if (action === 'yesterday') {
      await ensureMockForYesterdayAllCompanies();
      return res.render('tools/mock_records', {
        title: 'Mock Records', active: 'tools',
        form: { sinceDays },
        result: { ok: true, message: 'สร้างข้อมูล mock ของเมื่อวานให้ทุกบริษัทแล้ว' },
      });
    }
    return res.render('tools/mock_records', {
      title: 'Mock Records', active: 'tools',
      form: { sinceDays },
      result: { ok: false, error: 'ไม่พบ action ที่สั่ง' },
    });
  } catch (err) {
    return res.render('tools/mock_records', {
      title: 'Mock Records', active: 'tools',
      form: { sinceDays },
      result: { ok: false, error: err?.message || String(err) },
    });
  }
});

/* ------------------------------------------------------------------ */
/* Settings: Procurement                                              */
/* ------------------------------------------------------------------ */

router.get('/settings/procurement', requireAuth, async (req, res) => {
  const defaultCompanyId = process.env.DEFAULT_COMPANY_ID || null;
  let resolvedCompanyId = defaultCompanyId;
  if (!resolvedCompanyId) {
    const first = await Company.findOne({}).sort({ name: 1 }).lean();
    resolvedCompanyId = first?._id ? String(first._id) : null;
  }
  const config = {
    defaultCompanyId: resolvedCompanyId,
    emailProvider: process.env.EMAIL_PROVIDER || 'disabled',
    lineChannel: process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'configured' : 'not set',
    notifyRoles: ['Procurement', 'Finance', 'Supervisor'],
    safetyStockDays: Number(process.env.PROCUREMENT_SAFETY_DAYS || 3),
  };
  return res.render('procurement/settings', { title: 'Settings', active: 'tools', config });
});

router.post('/settings/procurement/snapshot', requireAuth, async (req, res) => {
  const safetyStockDays = Number(req.body?.safetyStockDays || process.env.PROCUREMENT_SAFETY_DAYS || 3);
  const first = await Company.findOne({}).sort({ name: 1 }).lean();
  const targetCompanyId = process.env.DEFAULT_COMPANY_ID || (first?._id ? String(first._id) : null);
  const config = {
    defaultCompanyId: targetCompanyId,
    emailProvider: process.env.EMAIL_PROVIDER || 'disabled',
    lineChannel: process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'configured' : 'not set',
    notifyRoles: ['Procurement', 'Finance', 'Supervisor'],
    safetyStockDays,
  };
  try {
    if (!targetCompanyId) throw new Error('ยังไม่มีบริษัทในระบบ');
    await generateSnapshot(targetCompanyId, { safetyStockDays });
    return res.render('procurement/settings', { title: 'Settings', active: 'tools', config, result: { ok: true, message: 'สร้าง snapshot สำเร็จ' } });
  } catch (err) {
    return res.render('procurement/settings', { title: 'Settings', active: 'tools', config, result: { ok: false, error: err?.message || 'สร้าง snapshot ไม่สำเร็จ' } });
  }
});

router.post('/tools/send-daily', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  const { companyId, date } = req.body || {};
  const toRaw = req.body?.to;
  const to = Array.isArray(toRaw) ? (toRaw.find((v) => v && String(v).trim()) || '').trim() : (toRaw || '').trim();
  if (!companyId || !date) {
    return res.render('tools/send_daily', {
      companies,
      members: await Member.find({ companyId, active: true }).lean(),
      result: { ok: false, error: 'กรุณาเลือกบริษัทและวันที่' },
      form: req.body,
      title: 'Send Daily (Manual)',
      active: 'tools',
    });
  }

  try {
    const isoDate = dayjs(date).format('YYYY-MM-DD');
    const { picked, reason } = await pickUsableDate(companyId, isoDate);

    const summary = await buildDailySummary(companyId, picked);
    const message = renderDailySummaryMessage(summary);
    const members = await Member.find({ companyId, active: true, lineUserId: { $ne: '' } }).lean();

    const sent = [];
    const targets = (typeof to === 'string' && to)
      ? [{ lineUserId: to, displayName: 'Direct' }]
      : members;
    for (const m of targets) {
      try {
        const prefix = (reason !== 'exact')
          ? `ℹ️ (${reason === 'same-month'
                ? `ไม่มีข้อมูลวันที่ ${isoDate} แสดงของวันที่ ${picked}`
                : `ไม่มีข้อมูลเดือนนี้ แสดงของวันที่ล่าสุด ${picked}`})\n\n`
          : '';
        await pushLineMessage(m.lineUserId, prefix + message);
        sent.push({ to: m.lineUserId, ok: true });
      } catch (err) {
        sent.push({ to: m.lineUserId, ok: false, error: err?.response?.data || err.message });
      }
    }

    return res.render('tools/send_daily', {
      companies,
      members: await Member.find({ companyId, active: true }).lean(),
      result: { ok: true, sent, preview: message, picked, reason },
      form: { companyId, date: picked, to },
      title: 'Send Daily (Manual)',
      active: 'tools',
    });
  } catch (err) {
    console.error('[TOOLS SEND ERROR]', err);
    return res.render('tools/send_daily', {
      companies,
      members: await Member.find({ companyId, active: true }).lean(),
      result: { ok: false, error: err.message || String(err) },
      form: req.body,
      title: 'Send Daily (Manual)',
      active: 'tools',
    });
  }
});

/* ------------------------------------------------------------------ */
/* Test: Preview / Send                                                */
/* ------------------------------------------------------------------ */

router.get('/test', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();

  let companyId = '';
  let recentDates = [];

  for (const company of companies) {
    const dates = await loadRecentDates(company._id);
    if (dates.length) {
      companyId = company._id.toString();
      recentDates = dates;
      break;
    }
  }

  if (!companyId && companies[0]?._id) {
    companyId = companies[0]._id.toString();
    recentDates = await loadRecentDates(companies[0]._id);
  }

  const members = companyId ? await Member.find({ companyId, active: true }).lean() : [];
  const envRecipients = (process.env.TEST_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(id => ({ lineUserId: id, displayName: `(ENV) ${id.slice(0, 6)}…` }));
  const recipients = [
    ...members.map(m => ({ lineUserId: m.lineUserId, displayName: m.displayName || m.lineUserId })),
    ...envRecipients,
  ];

  const defaultDate = recentDates[0]?.dateStr || dayjs().format('YYYY-MM-DD');

  res.render('test', {
    companies,
    recipients,
    preview: null,
    sent: null,
    form: { companyId, date: defaultDate, lineUserId: recipients[0]?.lineUserId || '' },
    recentDates,
    error: null,
    title: 'Test & Send',
    active: 'test',
  });
});

router.post('/test/preview', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  const { companyId, date } = req.body || {};

  const members = companyId ? await Member.find({ companyId, active: true }).lean() : [];
  const envRecipients = (process.env.TEST_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(id => ({ lineUserId: id, displayName: `(ENV) ${id.slice(0, 6)}…` }));
  const recipients = [
    ...members.map(m => ({ lineUserId: m.lineUserId, displayName: m.displayName || m.lineUserId })),
    ...envRecipients,
  ];

  const recentDates = await loadRecentDates(companyId);

  if (!companyId || !date) {
    return res.render('test', { companies, recipients, recentDates, sent: null, preview: null, form: req.body, error: 'กรุณาเลือกบริษัทและวันที่', title: 'Test & Send', active: 'test' });
  }

  try {
    const isoDate = dayjs(date).format('YYYY-MM-DD');
    const { picked, reason } = await pickUsableDate(companyId, isoDate);

    if (reason !== 'exact') {
      console.log('[TEST PREVIEW][AUTO-PICK]', { requested: isoDate, picked, reason });
    }

    const summary = await buildDailySummary(companyId, picked);
    const message = renderDailySummaryMessage(summary);

    const note =
      reason === 'exact' ? null :
      reason === 'no-data' ? '*ยังไม่มีข้อมูลสำหรับบริษัทนี้ในระบบ กรุณาตรวจสอบการจับคู่ชื่อบริษัทในเมนู Companies*' :
      reason === 'same-month' ? `*ไม่มีข้อมูลวันที่ ${isoDate} แสดงของวันที่ ${picked} (วันอื่นในเดือนเดียวกัน)*` :
      reason === 'latest-any' ? `*ไม่มีข้อมูลเดือนนี้ แสดงของวันที่ล่าสุด ${picked} ที่มีข้อมูล*` :
      `*ไม่พบข้อมูลวันที่ ${isoDate}*`;

    return res.render('test', {
      companies,
      recipients,
      recentDates,
      sent: null,
      form: { companyId, date: picked, lineUserId: req.body.lineUserId || recipients[0]?.lineUserId || '' },
      preview: { summary, message, note },
      error: null,
      title: 'Test & Send',
      active: 'test',
    });
  } catch (err) {
    console.error('[PREVIEW ERROR]', err);
    return res.render('test', { companies, recipients, recentDates, sent: null, preview: null, form: req.body, error: err.message || String(err), title: 'Test & Send', active: 'test' });
  }
});

router.post('/test/send', requireAuth, async (req, res) => {
  const companies = await Company.find().lean();
  const { companyId, date, lineUserId } = req.body || {};

  const members = companyId ? await Member.find({ companyId, active: true }).lean() : [];
  const envRecipients = (process.env.TEST_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(id => ({ lineUserId: id, displayName: `(ENV) ${id.slice(0, 6)}…` }));
  const recipients = [
    ...members.map(m => ({ lineUserId: m.lineUserId, displayName: m.displayName || m.lineUserId })),
    ...envRecipients,
  ];

  const recentDates = await loadRecentDates(companyId);

  if (!companyId || !date || !lineUserId) {
    return res.render('test', { companies, recipients, recentDates, sent: null, preview: null, form: req.body, error: 'กรุณาเลือกบริษัท/วันที่/ผู้รับ', title: 'Test & Send', active: 'test' });
  }
  try {
    const isoDate = dayjs(date).format('YYYY-MM-DD');
    const { picked, reason } = await pickUsableDate(companyId, isoDate);

    if (reason === 'no-data') {
      return res.render('test', {
        companies,
        recipients,
        recentDates,
        form: req.body,
        preview: null,
        sent: null,
        error: 'ยังไม่มีข้อมูลสำหรับบริษัทนี้ในระบบ กรุณาตรวจสอบการตั้งค่าชื่อบริษัทในเมนู Companies',
        title: 'Test & Send',
        active: 'test',
      });
    }

    const summary = await buildDailySummary(companyId, picked);
    const message = renderDailySummaryMessage(summary);
    const finalMessage =
      (reason !== 'exact')
        ? `ℹ️ (${reason === 'same-month'
              ? `ไม่มีข้อมูลวันที่ ${isoDate} แสดงของวันที่ ${picked}`
              : `ไม่มีข้อมูลเดือนนี้ แสดงของวันที่ล่าสุด ${picked}`})\n\n` + message
        : message;

    const pushRes = await pushLineMessage(lineUserId, finalMessage);
    const sent = (pushRes?.ok !== false) ? { ok: true, to: lineUserId } : { ok: false, error: pushRes?.error || 'push failed' };

    return res.render('test', {
      companies,
      recipients,
      recentDates,
      form: { companyId, date: picked, lineUserId },
      preview: { summary, message: finalMessage },
      sent,
      error: null,
      title: 'Test & Send',
      active: 'test',
    });
  } catch (err) {
    console.error('[SEND ERROR]', err);
    return res.render('test', { companies, recipients, recentDates, form: req.body, preview: null, sent: { ok: false, error: err.message || String(err) }, error: null, title: 'Test & Send', active: 'test' });
  }
});

// POST /admin/test/push-flex { userId, prId }
router.post('/test/push-flex', requireAuth, async (req, res, next) => {
  try {
    const { userId, prId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId is required' });
    }
    await pushFlex(userId, flexAdminShortcuts(prId), 'NILA · Admin Shortcuts');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.use(procurementRouter);

export default router;
export { pickUsableDate };
