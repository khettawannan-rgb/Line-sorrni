// src/routes/webhook.js
import { Router } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { replyText, replyFlex, pushLineMessage, getUserProfile } from '../services/line.js';
import { onTextGameMenu } from '../handlers/textGameMenu.js';
import LineChatLog from '../models/lineChatLog.model.js';
import LineMedia from '../models/lineMedia.model.js';
import Company from '../models/Company.js';
import Vendor from '../models/Vendor.js';
import Member from '../models/Member.js';
import {
  buildConsentUrl,
  ensureConsentRecord,
  shouldPromptConsent,
  updateConsentPrompted,
  fetchConsent,
  recordConsentDecision,
} from '../services/consent.js';
import { downloadImage, saveImageMeta, saveLocationMeta } from '../services/lineMedia.js';
import {
  getDateRangeFromKeyword,
  buildDailySummary,
  renderDailySummaryMessage,
} from '../services/summary.js';
import { fetchWeatherSummary, formatWeatherText } from '../services/weather.js';
import { findBotFaqResponse } from '../services/botFaq.js';
import {
  getLowStockItems,
  listPurchaseOrders,
  getPurchaseOrderByNumber,
  createPurchaseOrder,
  createVendor,
  STATUS_LABELS,
} from '../services/procurement/index.js';
import { buildWeatherAdvice } from '../services/advice/weather-advice.js';
import { buildFlexWeatherAdvice } from '../line/buildFlexWeatherAdvice.js';
import { buildStockAlert } from '../services/stock/stock-alert.js';
import { buildFlexStockAlert } from '../line/buildFlexStockAlert.js';
import { buildPoStatusMockFlex, buildIoSummaryListFlex } from '../services/mock/menuMock.js';
import { handleQuizMessage } from '../services/game/quiz.js';
import { nextIndex } from '../mock/state.js';

const router = Router();

const REQUIRED_LINE_ENVS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LIFF_ID',
  'LIFF_ID_PR',
  'LIFF_ID_PO',
  'LIFF_ID_APPROVE',
];

const FEATURE_WEATHER = String(process.env.FEATURE_WEATHER_ADVICE || '').toLowerCase() === 'true';
const FEATURE_STOCK = String(process.env.FEATURE_STOCK_ALERTS || '').toLowerCase() === 'true';
const FEATURE_TEXT_QUIZ = String(process.env.FEATURE_TEXT_QUIZ || '').toLowerCase() === 'true';

REQUIRED_LINE_ENVS.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`[WEBHOOK][CONFIG] Missing env ${key}`);
  }
});

// ใช้ raw parser เฉพาะเส้นทางนี้ (สำคัญสำหรับ signature)
router.use(
  '/',
  bodyParser.raw({ type: '*/*', limit: '5mb' }) // กัน 413 และให้ได้ Buffer แท้ ๆ
);

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const STRICT_SIGNATURE =
  String(process.env.STRICT_LINE_SIGNATURE || '').toLowerCase() === 'true';
const DEFAULT_WEATHER_LAT = Number(process.env.DEFAULT_WEATHER_LATITUDE || 13.7563);
const DEFAULT_WEATHER_LNG = Number(process.env.DEFAULT_WEATHER_LONGITUDE || 100.5018);
const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || '';
const BASE_URL = process.env.BASE_URL; // updated to use BASE_URL
const BASE_URL_CLEAN = (BASE_URL || '').replace(/\/$/, '');
const PROCUREMENT_SAFETY_DAYS = Number(process.env.PROCUREMENT_SAFETY_DAYS || 3);

// Fallback resolver: when DEFAULT_COMPANY_ID is not configured, pick the first company
async function resolveCompanyIdFallback() {
  if (DEFAULT_COMPANY_ID) return DEFAULT_COMPANY_ID;
  try {
    const doc = await Company.findOne({}).sort({ name: 1 }).lean();
    return doc?._id ? String(doc._id) : null;
  } catch (err) {
    console.warn('[WEBHOOK] resolveCompanyIdFallback error:', err?.message || err);
    return null;
  }
}

const SUPER_ADMIN_SUPPLIER_CATALOG = [
  {
    id: 'tipco',
    name: 'บริษัท ทิปโก้แอสฟัลท์ จำกัด (มหาชน)',
    taxId: '0107535000044',
    address:
      '118/1 ถนนพระราม 6 แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400',
    phone: '+66-2273-6020',
    category: 'ยางมะตอย',
    products: [
      { id: 'tipco-ac6070', name: 'ยาง AC-60/70', unit: 'ตัน', unitPrice: 32500 },
      { id: 'tipco-ac4050', name: 'ยาง AC-40/50', unit: 'ตัน', unitPrice: 33000 },
      { id: 'tipco-crs1', name: 'ยาง CRS-1', unit: 'ตัน', unitPrice: 28000 },
      { id: 'tipco-pma', name: 'ยาง PMA', unit: 'ตัน', unitPrice: 36500 },
    ],
  },
  {
    id: 'quarry-a',
    name: 'โรงโม่ A',
    taxId: '0100000000001',
    address: '99 หมู่ 4 ตำบลบางปลา อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
    phone: '+66-2100-1001',
    category: 'หิน/ดิน',
    products: [
      { id: 'quarry-a-34', name: 'หิน 3/4"', unit: 'ตัน', unitPrice: 750 },
      { id: 'quarry-a-38', name: 'หิน 3/8"', unit: 'ตัน', unitPrice: 720 },
      { id: 'quarry-a-dust', name: 'หินฝุ่น', unit: 'ตัน', unitPrice: 680 },
    ],
  },
  {
    id: 'quarry-b',
    name: 'โรงโม่ B',
    taxId: '0100000000002',
    address: '88 หมู่ 7 ตำบลบางโฉลง อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
    phone: '+66-2100-2002',
    category: 'หิน/ดิน',
    products: [
      { id: 'quarry-b-base', name: 'หินคลุก', unit: 'ตัน', unitPrice: 690 },
      { id: 'quarry-b-sand', name: 'ทรายถม', unit: 'ลูกบาศก์เมตร', unitPrice: 350 },
      { id: 'quarry-b-crush', name: 'ดินลูกรัง', unit: 'ลูกบาศก์เมตร', unitPrice: 280 },
    ],
  },
  {
    id: 'quarry-c',
    name: 'โรงโม่ C',
    taxId: '0100000000003',
    address: '55 หมู่ 2 ตำบลโพธิ์เสด็จ อำเภอเมือง จังหวัดนครศรีธรรมราช 80000',
    phone: '+66-7535-3030',
    category: 'หิน/ดิน',
    products: [
      { id: 'quarry-c-12', name: 'หิน 1/2"', unit: 'ตัน', unitPrice: 740 },
      { id: 'quarry-c-fine', name: 'ทรายละเอียด', unit: 'ลูกบาศก์เมตร', unitPrice: 420 },
    ],
  },
  {
    id: 'ptt',
    name: 'ปตท. น้ำมันและการค้าปลีก จำกัด (มหาชน)',
    taxId: '0107546000376',
    address: '555 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900',
    phone: '+66-2140-8888',
    category: 'น้ำมันเชื้อเพลิง',
    products: [
      { id: 'ptt-diesel', name: 'น้ำมันดีเซล B7', unit: 'ลิตร', unitPrice: 32.5 },
      { id: 'ptt-gasohol', name: 'น้ำมันแก๊สโซฮอล์ 95', unit: 'ลิตร', unitPrice: 34.2 },
      { id: 'ptt-lube', name: 'น้ำมันหล่อลื่นอุตสาหกรรม', unit: 'ลิตร', unitPrice: 180 },
    ],
  },
];

const SUPER_ADMIN_QUANTITY_OPTIONS = [1, 5, 10, 20, 40];

const WEATHER_KEYWORDS = [/อากาศ/i, /weather/i, /ฝนตก/i, /พยากรณ์/i];

const RAW_SUPER_ADMIN_IDS = [
  ...String(process.env.SUPER_ADMIN_LINE_USER_IDS || '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean),
  ...String(process.env.TEST_USER_IDS || '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean),
];
const SUPER_ADMIN_LINE_IDS = new Set(RAW_SUPER_ADMIN_IDS);
const SUPER_ADMIN_CACHE = new Map();

dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);

/** ตรวจลายเซ็นจาก LINE (ถ้าเปิด STRICT_LINE_SIGNATURE=true จะบังคับตรวจ) */
function verifyLineSignatureOrSkip(req) {
  const signature = req.headers['x-line-signature'];
  if (!CHANNEL_SECRET || !signature) {
    if (STRICT_SIGNATURE) return false;
    console.warn(
      '[WEBHOOK] signature skipped:',
      { hasSecret: !!CHANNEL_SECRET, hasHeader: !!signature, strict: STRICT_SIGNATURE }
    );
    return true;
  }
  try {
    const hmac = crypto
      .createHmac('sha256', CHANNEL_SECRET)
      // ต้องเป็น Buffer ดิบ ๆ ที่ parser ใส่ให้ใน req.body
      .update(req.body)
      .digest('base64');
    if (hmac === signature) return true;
    console.warn('[WEBHOOK] signature mismatch detected', {
      strict: STRICT_SIGNATURE,
      signatureLength: signature?.length ?? 0,
    });
    return !STRICT_SIGNATURE;
  } catch (e) {
    console.error('[WEBHOOK] verify error:', e);
    return false;
  }
}

// ============ Endpoint ============
router.get('/', (req, res) => {
  res.status(200).send('OK');
});

router.post('/', async (req, res) => {
  const start = Date.now();
  const signatureHeader = req.headers['x-line-signature'];
  const bodySize = Buffer.isBuffer(req.body) ? req.body.length : Buffer.byteLength(String(req.body || ''));
  console.log('[WEBHOOK][IN]', {
    at: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    signature: signatureHeader ? 'present' : 'missing',
    bodySize,
  });
  // LOG หัวข้อเบื้องต้น (ช่วยดีบัก 500)
  console.log('[WEBHOOK][HEADERS]', {
    'content-type': req.headers['content-type'],
    'x-line-signature': signatureHeader ? '[present]' : '[missing]',
    'content-length': req.headers['content-length'] || (req.body?.length ?? 0),
  });

  try {
    // 1) verify (หรือข้าม หากไม่ strict)
    const ok = verifyLineSignatureOrSkip(req);
    if (!ok) {
      console.warn('[WEBHOOK] invalid signature -> 401');
      return res.sendStatus(401);
    }

    // 2) parse body จาก Buffer
    let packet = {};
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (req.body?.toString?.() || '');
      packet = rawBody ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.warn('[WEBHOOK] JSON parse failed ->', e.message);
      packet = {};
    }

    const events = Array.isArray(packet.events) ? packet.events : [];
    console.log('[WEBHOOK] events len =', events.length);

    // ตอบ 200 ให้ LINE ก่อน (สำคัญ)
    res.sendStatus(200);

    // 3) ประมวลผลแบบ async
    for (const ev of events) {
      try {
        await handleEvent(ev);
      } catch (err) {
        console.error('[WEBHOOK] handleEvent error:', err);
        // พยายามตอบกลับ error user-friendly ถ้ายังพอมี replyToken
        if (ev?.replyToken) {
          try { await replyText(ev.replyToken, 'เกิดข้อผิดพลาดในการประมวลผล'); } catch {}
        }
      }
    }
    console.log('[WEBHOOK][DONE]', {
      events: events.length,
      status: res.statusCode,
      elapsedMs: Date.now() - start,
    });
  } catch (err) {
    // ถ้ามี exception ก่อนส่ง 200
    console.error('[WEBHOOK] fatal error:', err);
    // พยายามตอบข้อความธรรมดาแทน 500 (บางระบบจะดีบักง่ายกว่า)
    try {
      res.status(200).send('ok');
    } catch {
      return; // เงียบไว้
    }
    console.log('[WEBHOOK][DONE]', {
      events: 0,
      error: err?.message || err,
      status: res.statusCode,
      elapsedMs: Date.now() - start,
    });
    return;
  }
});

function getUserId(ev) {
  return ev?.source?.userId || null;
}

async function isSuperAdminUser(userId) {
  if (!userId) return false;
  if (SUPER_ADMIN_LINE_IDS.has(userId)) return true;

  const cached = SUPER_ADMIN_CACHE.get(userId);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.value;
  }

  try {
    const member = await Member.findOne({ lineUserId: userId }).lean();
    const isSuper = Boolean(member && member.role === 'super');
    if (isSuper) {
      SUPER_ADMIN_LINE_IDS.add(userId);
    }
    SUPER_ADMIN_CACHE.set(userId, { value: isSuper, expires: now + 5 * 60 * 1000 });
    return isSuper;
  } catch (err) {
    console.warn(`[WEBHOOK] super admin lookup failed for ${userId}:`, err.message || err);
    SUPER_ADMIN_CACHE.set(userId, { value: false, expires: now + 60 * 1000 });
    return false;
  }
}

function escapeRegex(input = '') {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const numeric = String(value).replace(/[,\s]/g, '');
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseDateInput(input) {
  if (!input) return null;
  const value = String(input).trim();
  if (!value) return null;
  const formats = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'];
  for (const fmt of formats) {
    const parsed = dayjs(value, fmt, true);
    if (parsed.isValid()) return parsed.toDate();
  }
  const fallback = dayjs(value);
  return fallback.isValid() ? fallback.toDate() : null;
}

function hasPlaceholder(value) {
  return /<.+?>/.test(String(value || ''));
}

async function logIncomingEvent(ev, consentDoc) {
  try {
    const consentStatus = consentDoc?.status || 'unknown';
    const consentGranted = consentStatus === 'granted';

    const entry = {
      userId: getUserId(ev),
      type: ev?.type,
      messageType: ev?.message?.type,
      text: ev?.message?.type === 'text' ? ev?.message?.text : undefined,
      payload: ev,
      timestamp: ev?.timestamp,
      consentGranted,
      consentStatus,
    };

    await LineChatLog.create(entry);
  } catch (err) {
    console.error('[WEBHOOK] logIncomingEvent error:', err.message);
  }
}

async function ensureUserConsent(ev, consentDoc, opts = {}) {
  const userId = getUserId(ev);
  if (!userId) return true; // ไม่ใช่แชท 1:1 ตาม PDPA

  // Demo mode: auto-accept consent for all users (for final pitch)
  const AUTO_ACCEPT = String(process.env.CONSENT_AUTO_ACCEPT || 'true').toLowerCase() === 'true';
  if (AUTO_ACCEPT) {
    try {
      await recordConsentDecision(userId, true, { channel: 'auto', note: 'auto-accept (demo)' });
    } catch (err) {
      console.warn('[WEBHOOK] auto-accept consent failed:', err?.message || err);
    }
    return true;
  }

  const consent = consentDoc || (await fetchConsent(userId));
  if (consent?.status === 'granted') return true;

  const forcePrompt = opts.forcePrompt === true;
  const promptNeeded = forcePrompt || shouldPromptConsent(consent);

  const consentUrl = buildConsentUrl(userId);
  const message =
    'เพื่อให้ทีมสามารถให้บริการและส่งสรุปรายงานได้อย่างถูกต้อง\n' +
    'โปรดกดยืนยันการยินยอมให้เก็บข้อมูลส่วนบุคคลได้ที่ลิงก์ด้านล่าง:\n' +
    consentUrl;

  if (!promptNeeded) {
    // respond with the same consent reminder even during cooldown so the user gets feedback
    try {
      if (ev.replyToken) {
        await replyText(ev.replyToken, message);
      } else {
        await pushLineMessage(userId, message);
      }
    } catch (err) {
      console.error('[WEBHOOK] resend consent prompt failed:', err.message);
    }
    return false;
  }

  let profile = consent?.profile;
  if (!profile?.displayName) {
    try {
      profile = await getUserProfile(userId);
    } catch (err) {
      console.warn('[WEBHOOK] getUserProfile failed:', err.message);
    }
  }

  await updateConsentPrompted(userId, {
    displayName: profile?.displayName,
    pictureUrl: profile?.pictureUrl,
    profile,
  });

  try {
    if (ev.replyToken) {
      await replyText(ev.replyToken, message);
    } else {
      await pushLineMessage(userId, message);
    }
  } catch (err) {
    console.error('[WEBHOOK] send consent prompt failed:', err.message);
  }

  return false;
}

// ============ Handlers ============
async function handleEvent(ev) {
  const userId = getUserId(ev);

  let consent = null;
  if (userId) {
    try {
      consent = await ensureConsentRecord(userId);
    } catch (err) {
      console.error('[WEBHOOK] ensureConsentRecord error:', err.message || err);
    }
  }

  await logIncomingEvent(ev, consent);

  if (ev.type === 'follow') {
    try {
      await ensureUserConsent(ev, consent, { forcePrompt: true });
    } catch (err) {
      console.error('[WEBHOOK] ensureUserConsent follow error:', err.message || err);
    }
    return;
  }

  let hasConsent = true;
  try {
    hasConsent = await ensureUserConsent(ev, consent);
  } catch (err) {
    console.error('[WEBHOOK] ensureUserConsent error:', err.message || err);
    hasConsent = true; // ให้บอทตอบต่อเพื่อไม่ให้ผู้ใช้ติดค้าง
  }
  if (!hasConsent) return;

  if (ev.type === 'message') {
    return handleMessageEvent(ev);
  }

  if (ev.type === 'postback') {
    return handlePostbackEvent(ev);
  }

  if (ev.replyToken) {
    return replyText(ev.replyToken, 'pong');
  }
}

async function handleMessageEvent(ev) {
  const msg = ev.message;
  if (!msg) return;

  if (msg.type === 'text') return handleText(ev);
  if (msg.type === 'image') return handleImage(ev);
  if (msg.type === 'location') return handleLocation(ev);

  if (ev.replyToken) {
    return replyActionCard(ev.replyToken, {
      title: 'เริ่มต้นใช้งาน',
      body: 'พิมพ์คำว่า "เมนู" เพื่อเลือกคำสั่งที่ต้องการ หรือแตะปุ่มด้านล่าง',
      actions: [
        { label: 'เปิดเมนู', text: 'เมนู' },
      ],
      color: '#1f2937',
      altText: 'เริ่มต้นใช้งาน',
    });
  }
}

async function handlePostbackEvent(ev) {
  const data = ev.postback?.data || '';
  const [action, query = ''] = data.split('?');
  const params = new URLSearchParams(query);

  if (action === 'main-menu' || action === 'MAIN_MENU') {
    return replyMainMenu(ev);
  }

  if (action === 'open_daily_report') {
    const idx = nextIndex('menu.summary.today', 10);
    const flex = buildIoSummaryListFlex('today', 400000 + idx, { single: true, index: idx });
    return replyFlex(ev.replyToken, 'สรุปรายงาน (Mock)', flex.contents);
  }

  if (action === 'coming_soon') {
    const feat = params.get('feature') || '';
    if (feat === 'contact') {
      // For contact, reply a short text only
      return replyText(ev.replyToken, 'กำลังติดต่อเจ้าหน้าที่ให้ค่ะ รอสักครู่');
    }
    const polite =
      Math.random() < 0.5
        ? 'ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้ค่ะ ขอบคุณที่รอ 🙏'
        : 'กำลังมาเร็วๆ นี้ค่ะ ขอบคุณที่รอนะคะ 💙';
    const bubble = buildMainMenuFlex();
    return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [{ type: 'text', text: polite }]);
  }

  if (action === 'po-status') {
    const userId = getUserId(ev);
    if (!(await isSuperAdminUser(userId))) {
      return replyText(ev.replyToken, 'ฟีเจอร์นี้ใช้ได้เฉพาะผู้ดูแลระบบ');
    }
    const target = params.get('company');
    if (!target || target === 'menu') {
      return replyCompanyStatusMenu(ev);
    }
    if (target === 'all') {
      return replyPurchaseOrderStatus(ev, '', {});
    }
    return replyPurchaseOrderStatus(ev, '', { companyId: target });
  }

  if (action === 'po-create') {
    const step = params.get('step') || '';
    const userId = getUserId(ev);
    const superAdmin = await isSuperAdminUser(userId);
    if (superAdmin) {
      if (step === 'super-company') {
        return replySuperAdminCompanySelect(ev);
      }
      if (step === 'super-vendor') {
        const companyId = params.get('company');
        if (!companyId) {
          return replySuperAdminCompanySelect(ev);
        }
        return replySuperAdminVendorSelect(ev, companyId);
      }
      if (step === 'super-product') {
        const companyId = params.get('company');
        const vendorId = params.get('vendor');
        if (!companyId || !vendorId) {
          return replySuperAdminPoStart(ev);
        }
        return replySuperAdminProductSelect(ev, companyId, vendorId);
      }
      if (step === 'super-qty') {
        const companyId = params.get('company');
        const vendorId = params.get('vendor');
        const productId = params.get('product');
        if (!companyId || !vendorId || !productId) {
          return replySuperAdminPoStart(ev);
        }
        return replySuperAdminQuantitySelect(ev, companyId, vendorId, productId);
      }
      if (step === 'super-create') {
        const companyId = params.get('company');
        const vendorId = params.get('vendor');
        const productId = params.get('product');
        const qty = params.get('qty');
        if (!companyId || !vendorId || !productId) {
          return replySuperAdminPoStart(ev);
        }
        return handleSuperAdminPoCreate(ev, companyId, vendorId, productId, qty);
      }
    }
    if (step === 'start') {
      return replyPoDraftInstructions(ev);
    }
    if (step === 'template') {
      return replyPoDraftTemplate(ev);
    }
  }

  if (action === 'CONTACT_US') {
    // Per request: reply short text only
    return replyText(ev.replyToken, 'กำลังติดต่อเจ้าหน้าที่ให้ค่ะ รอสักครู่');
  }

  // Backward-compat for existing Rich Menu postbacks
  if (action === 'DAILY_REPORT' || action === 'DAILY' || action === 'TODAY' || action === 'REPORT_TODAY') {
    const idx = nextIndex('menu.summary.today', 10);
    const flex = buildIoSummaryListFlex('today', 400000 + idx, { single: true, index: idx });
    return replyFlex(ev.replyToken, 'สรุปรายงาน (Mock)', flex.contents);
  }
  if (action === 'FIND_REPORT' || action === 'NOW' || action === 'LATEST') {
    const bubble = buildMainMenuFlex();
    return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [
      { type: 'text', text: 'ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้ค่ะ ขอบคุณที่รอ 🙏' },
    ]);
  }
  if (action === 'CONNECT_COMPANY') {
    const bubble = buildMainMenuFlex();
    return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [
      { type: 'text', text: 'ฟีเจอร์เชื่อมต่อบริษัทยังไม่พร้อมใช้งานค่ะ กำลังพัฒนาอยู่ 🙏' },
    ]);
  }
  if (action === 'SETTINGS') {
    const bubble = buildMainMenuFlex();
    return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [
      { type: 'text', text: 'เมนูตั้งค่ายังไม่พร้อมใช้งาน กำลังมาเร็วๆ นี้ค่ะ 💙' },
    ]);
  }

  // Default for unmapped postbacks → Coming soon + Flex menu
  const bubble = buildMainMenuFlex();
  return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [
    { type: 'text', text: 'ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้ค่ะ ขอบคุณที่รอ 🙏' },
  ]);
}

async function handleText(ev) {
  const text = (ev.message?.text || '').trim();
  const userId = getUserId(ev);
  const superAdmin = await isSuperAdminUser(userId);

  // Game: prefer LIFF (default). Text quiz only when FEATURE_TEXT_QUIZ=true
  if (FEATURE_TEXT_QUIZ) {
    try {
      const handledQuiz = await handleQuizMessage(ev);
      if (handledQuiz) return handledQuiz;
    } catch (err) {
      console.warn('[WEBHOOK] quiz handler error', err?.message || err);
    }
  }

  // LIFF game menu (default)
  try {
    const handled = await onTextGameMenu(ev);
    if (handled) return handled;
  } catch (err) {
    console.warn('[WEBHOOK] game menu handler error', err?.message || err);
  }

  if (/^ping$/i.test(text) || text === 'เทส') {
    return replyText(ev.replyToken, 'pong');
  }

  if (FEATURE_WEATHER && /(อากาศ|พยากรณ์|ฝน|พายุ|ฟ้าแลบ|ลมแรง|ร้อน|หนาว)/i.test(text)) {
    let scenario = 'ok';
    if (/พายุ|ฟ้าแลบ/i.test(text)) scenario = 'thunderstorm';
    else if (/ลม/i.test(text)) scenario = 'strong_wind';
    else if (/ฝนหนัก|ฝนตก/i.test(text)) scenario = 'heavy_rain';
    else if (/ร้อน/i.test(text)) scenario = 'heat_wave';
    else if (/หนาว|เย็น/i.test(text)) scenario = 'cool_dry';
    return replyWeatherAdvice(ev, scenario);
  }

  if (FEATURE_STOCK && /(สต็อก|ใกล้หมด|แจ้งเตือนสต็อก|stock)/i.test(text)) {
    return replyStockAlertMessage(ev);
  }

  // Rich menu (message) shortcuts
  if (/^(รายงานวันนี้|ล่าสุด|now|daily\s*report)$/i.test(text)) {
    const idx = nextIndex('menu.summary.today', 10);
    const flex = buildIoSummaryListFlex('today', 400000 + idx, { single: true, index: idx });
    return replyFlex(ev.replyToken, 'สรุปรายงาน (Mock)', flex.contents);
  }
  if (/^(เลือกรายงาน|ล่าสุด|ตั้งค่า|เชื่อมบริษัท|เชื่อมต่อบริษัท|find\s*report|settings|connect\s*company|latest)$/i.test(text)) {
    const bubble = buildMainMenuFlex();
    const polite = 'ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้ค่ะ ขอบคุณที่รอ 🙏';
    return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble, [{ type: 'text', text: polite }]);
  }
  if (/^(ติดต่อเรา|contact\s*us)$/i.test(text)) {
    return replyText(ev.replyToken, 'กำลังติดต่อเจ้าหน้าที่ให้ค่ะ รอสักครู่');
  }

  if (text === 'เมนู' || text === 'กลับสู่เมนู' || text === 'กลับเมนู' || text === 'เมนูหลัก') {
    return replyActionCard(ev.replyToken, {
      title: 'เมนูหลัก',
      subtitle: 'เลือกฟังก์ชันที่ต้องการ',
      actions: [
        { label: 'สถานะใบสั่งซื้อ', text: 'สถานะ' },
        { label: 'สรุปวันนี้', text: 'สรุป วันนี้' },
        { label: 'สรุปเมื่อวาน', text: 'สรุป เมื่อวาน' },
        { label: 'สรุปสัปดาห์นี้', text: 'สรุป สัปดาห์นี้' },
        { label: 'สรุปเดือนนี้', text: 'สรุป เดือนนี้' },
        { label: 'สร้างใบสั่งซื้อ (PO)', text: 'สร้างใบสั่งซื้อ' },
        { label: 'เปิดใบขอซื้อ (PR)', text: 'เปิดใบขอซื้อ' },
      ],
      color: '#1d4ed8',
      altText: 'เมนูหลัก',
    });
  }

  if (/^เช็คของ$/i.test(text) || /check stock/i.test(text)) {
    return replyStockSummary(ev);
  }

  if (/เปิดใบขอซื้อ/i.test(text)) {
    return replyPrLink(ev);
  }

  if (text === 'สถานะ' || text === 'เช็คสถานะ') {
    const useMock = String(process.env.MENU_MOCK_MODE || 'true').toLowerCase() === 'true';
    if (useMock) {
      const idx = nextIndex('menu.po', 10);
      const flex = buildPoStatusMockFlex(300000 + idx);
      return replyFlex(ev.replyToken, 'สถานะใบสั่งซื้อ (Mock)', flex.contents);
    }
    if (superAdmin && !/^เช็คสถานะใบสั่งซื้อ/i.test(text)) {
      return replyCompanyStatusMenu(ev);
    }
    return replyPurchaseOrderStatus(ev, text);
  }

  if (superAdmin) {
    const companyMsg = text.match(/^สถานะ\s*บริษัท\s+([0-9a-f]{24})$/i);
    if (companyMsg) {
      return replyPurchaseOrderStatus(ev, text, { companyId: companyMsg[1] });
    }
  }

  if (/เช็คสถานะ(สั่งซื้อ|ใบสั่งซื้อ)/i.test(text) || /^po[-\s]/i.test(text)) {
    return replyPurchaseOrderStatus(ev, text);
  }

  if (/สร้าง(ใบ)?สั่งซื้อ/i.test(text) || /สร้าง\s*po/i.test(text)) {
    return replyPoCreationFlex(ev);
  }

  if (/^po\s*ใหม่$/i.test(text)) {
    return replyPoDraftInstructions(ev);
  }

  if (/^po\s*ตัวอย่าง$/i.test(text) || /^ตัวอย่าง\s*po$/i.test(text)) {
    return replyPoDraftTemplate(ev);
  }

  if (/^po\s*ใหม่/i.test(text)) {
    const handled = await tryCreatePoFromFreeform(ev, text);
    if (handled) return handled;
  }

  if (text.startsWith('สรุป')) {
    const useMock = String(process.env.MENU_MOCK_MODE || 'true').toLowerCase() === 'true';
    if (useMock) {
      // Determine range keyword
      const kw = /เมื่อวาน/.test(text) ? 'yesterday' : /สัปดาห์/.test(text) ? 'week' : /เดือน/.test(text) ? 'month' : 'today';
      const idx = nextIndex(`menu.summary.${kw}`, 10);
      const flex = buildIoSummaryListFlex(kw, 400000 + idx, { single: true, index: idx });
      return replyFlex(ev.replyToken, 'สรุปรายงาน (Mock)', flex.contents);
    }
    const range = getDateRangeFromKeyword(text);
    if (!range) {
      return replyText(ev.replyToken, 'เช่น "สรุป วันนี้" หรือ "สรุป 10/09/2025"');
    }

    const date = range.dateFrom;
    if (superAdmin) {
      const companies = await Company.find().sort({ name: 1 }).lean();
      if (!companies.length) {
        return replyText(ev.replyToken, 'ยังไม่มีบริษัทในระบบสำหรับสรุปรายงาน');
      }

      const outputs = [];
      for (const company of companies) {
        try {
          const summary = await buildDailySummary(company._id, date);
          const rendered = renderDailySummaryMessage(summary);
          outputs.push(`บริษัท ${company.name}\n${rendered}`);
        } catch (err) {
          console.error('[WEBHOOK] summary error (superAdmin):', err);
          outputs.push(`บริษัท ${company.name}\nไม่สามารถดึงสรุปได้`);
        }
      }

      return replyText(ev.replyToken, outputs.join('\n\n'));
    }

    let companyId = process.env.DEFAULT_COMPANY_ID || '';
    if (!companyId) {
      const fallbackId = await resolveCompanyIdFallback();
      if (fallbackId) {
        console.warn('[WEBHOOK] DEFAULT_COMPANY_ID missing; using fallback company', fallbackId);
        companyId = fallbackId;
      } else {
        console.warn('[WEBHOOK] DEFAULT_COMPANY_ID is missing and no companies found');
        return replyText(ev.replyToken, 'ยังไม่มีข้อมูลบริษัทในระบบ');
      }
    }

    console.log('[WEBHOOK] buildDailySummary', { companyId, date });

    try {
      const summary = await buildDailySummary(companyId, date);
      const message = renderDailySummaryMessage(summary);
      return replyText(ev.replyToken, message);
    } catch (e) {
      console.error('[WEBHOOK] summary error:', e);
      return replyText(ev.replyToken, 'ดึงสรุปไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  }

  if (shouldReplyWeather(text)) {
    return replyWeather(ev);
  }

  let faqHit = null;
  try {
    faqHit = await findBotFaqResponse(text);
  } catch (err) {
    console.error('[WEBHOOK] findBotFaqResponse error:', err.message || err);
  }
  if (faqHit && faqHit.reply) {
    return replyText(ev.replyToken, faqHit.reply);
  }

  return replyActionCard(ev.replyToken, {
    title: 'ต้องการความช่วยเหลืออะไร?',
    subtitle: 'เลือกคำสั่งที่ต้องการจากปุ่มด้านล่าง',
    actions: [
      { label: 'เปิดเมนูหลัก', text: 'เมนู' },
      { label: 'สรุปรายวัน', text: 'สรุป วันนี้' },
      { label: 'สถานะใบสั่งซื้อ', text: 'สถานะ' },
      { label: 'สร้างใบสั่งซื้อ', text: 'สร้างใบสั่งซื้อ' },
    ],
    color: '#1d4ed8',
    altText: 'เมนูการใช้งาน',
  });
}

async function replyStockSummary(ev) {
  if (!ev.replyToken) return null;
  const userId = getUserId(ev);
  const superAdmin = await isSuperAdminUser(userId);
  let companyIdForUser = DEFAULT_COMPANY_ID;
  if (!companyIdForUser && !superAdmin) {
    companyIdForUser = await resolveCompanyIdFallback();
  }

  try {
    if (superAdmin) {
      const companies = await Company.find().sort({ name: 1 }).lean();
      if (!companies.length) {
        return replyText(ev.replyToken, 'ยังไม่มีบริษัทในระบบสำหรับตรวจสอบสต็อก');
      }

      const summaries = [];
      for (const company of companies) {
        const alerts = await getLowStockItems(company._id, {
          safetyDays: PROCUREMENT_SAFETY_DAYS,
        });
        if (!alerts.length) continue;

        const lines = alerts.slice(0, 5).map((item) => {
          const eta = item.forecastDate
            ? `หมดภายใน ${dayjs(item.forecastDate).fromNow(true)}`
            : 'ไม่มีข้อมูลคาดการณ์';
          return ` • ${item.itemName} คงเหลือ ${item.currentQuantity}${item.unit || ''} (รีออร์เดอร์ที่ ${item.reorderPoint}) · ${eta}`;
        });
        summaries.push([`บริษัท ${company.name}`, ...lines].join('\n'));
      }

      if (!summaries.length) {
        return replyText(ev.replyToken, '✅ คงคลังทุกบริษัทยังอยู่ในระดับปลอดภัย ไม่มีสินค้าใกล้หมด');
      }

      summaries.push('\nพิมพ์ "สร้างใบสั่งซื้อ" เพื่อเปิดคำสั่งซื้อใหม่ได้ทันที');
      return replyText(ev.replyToken, summaries.join('\n\n'));
    }

    const items = await getLowStockItems(companyIdForUser, {
      safetyDays: PROCUREMENT_SAFETY_DAYS,
    });
    if (!items.length) {
      return replyText(ev.replyToken, '✅ คงคลังยังอยู่ในระดับปลอดภัย ไม่มีสินค้าใกล้หมด');
    }

    const topItems = items.slice(0, 5);
    const lines = topItems.map((item) => {
      const eta = item.forecastDate
        ? `หมดภายใน ${dayjs(item.forecastDate).fromNow(true)}`
        : 'ไม่มีข้อมูลคาดการณ์';
      return `• ${item.itemName} คงเหลือ ${item.currentQuantity}${item.unit || ''} (สั่งซ้ำที่ ${item.reorderPoint}) · ${eta}`;
    });

    lines.push('', 'พิมพ์ "เปิดใบขอซื้อ" เพื่อสร้าง PR ใหม่ หรือ "สร้างใบสั่งซื้อ" เพื่อเปิดฟอร์ม PO');
    return replyText(ev.replyToken, lines.join('\n'));
  } catch (err) {
    console.error('[WEBHOOK] replyStockSummary error:', err.message || err);
    return replyText(ev.replyToken, 'ไม่สามารถดึงข้อมูลคงคลังได้ กรุณาลองใหม่อีกครั้ง');
  }
}

async function replyPrLink(ev) {
  if (!ev.replyToken) return null;
  const userId = getUserId(ev) || '';
  const params = new URLSearchParams();
  if (DEFAULT_COMPANY_ID) params.set('companyId', DEFAULT_COMPANY_ID);
  if (userId) params.set('uuid', userId);
  const liffUrl = `${BASE_URL_CLEAN || ''}/liff/pr${params.toString() ? `?${params.toString()}` : ''}`;
  const url = `${BASE_URL_CLEAN}/admin/pr`; // updated to use BASE_URL
  return replyActionCard(ev.replyToken, {
    title: 'เปิดใบขอซื้อ (PR)',
    subtitle: 'เปิดหน้าแดชบอร์ดในพอร์ทัล',
    body: [
      'แตะปุ่มด้านล่างเพื่อเปิดหน้าจัดการใบขอซื้อ',
      url,
      'ใช้บัญชีที่ได้รับสิทธิ์ในพอร์ทัล ERP เพื่อดำเนินการ',
    ],
    actions: [
      { label: 'เปิด PR (LIFF)', uri: liffUrl, style: 'primary' },
      { label: 'เปิดหน้า PR (เว็บ)', uri: url, style: 'secondary' },
      { label: 'กลับเมนูหลัก', text: 'เมนู', style: 'secondary' },
    ],
    color: '#16a34a',
    altText: 'เปิดหน้าจัดการใบขอซื้อ (PR)',
  });
}

const STATUS_COLOR_MAP = {
  pending: '#2563eb',
  approved: '#0ea5e9',
  in_delivery: '#f59e0b',
  delivered: '#16a34a',
  cancelled: '#dc2626',
};

function statusColor(status) {
  return STATUS_COLOR_MAP[status] || '#1e293b';
}

function formatCurrency(amount, currency = 'THB') {
  try {
    return Number(amount || 0).toLocaleString('th-TH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${amount || 0} ${currency}`;
  }
}

function buildPoStatusBubble(po, { showCompany = true } = {}) {
  const statusLabel = STATUS_LABELS[po.status] || po.status;
  const companyName = po.companyId?.name || 'ไม่ระบุบริษัท';
  const vendorName = po.vendorId?.name || '-';
  const totalText = formatCurrency(po.totalAmount, po.currency || 'THB');

  const infoRows = [];
  if (showCompany) {
    infoRows.push({
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'บริษัท', flex: 2, size: 'sm', color: '#64748b' },
        { type: 'text', text: companyName, flex: 4, size: 'sm', color: '#0f172a', wrap: true },
      ],
    });
  }
  infoRows.push(
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'ผู้จัดจำหน่าย', flex: 2, size: 'sm', color: '#64748b' },
        { type: 'text', text: vendorName, flex: 4, size: 'sm', color: '#0f172a', wrap: true },
      ],
    },
    {
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'ยอดรวม', flex: 2, size: 'sm', color: '#64748b' },
        { type: 'text', text: totalText, flex: 4, size: 'sm', weight: 'bold', color: '#0f172a' },
      ],
    }
  );

  if (po.expectedDeliveryDate) {
    infoRows.push({
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'กำหนดส่ง', flex: 2, size: 'sm', color: '#64748b' },
        {
          type: 'text',
          text: dayjs(po.expectedDeliveryDate).format('DD MMM YYYY'),
          flex: 4,
          size: 'sm',
          color: '#0f172a',
        },
      ],
    });
  }

  if (po.tracking?.trackingNumber) {
    infoRows.push({
      type: 'box',
      layout: 'baseline',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'Tracking', flex: 2, size: 'sm', color: '#64748b' },
        {
          type: 'text',
          text: `${po.tracking.trackingNumber}${po.tracking.carrier ? ` (${po.tracking.carrier})` : ''}`,
          flex: 4,
          size: 'sm',
          color: '#0f172a',
          wrap: true,
        },
      ],
    });
  }

  if (po.pdfUrl) {
    infoRows.push({
      type: 'text',
      text: 'มีไฟล์ PDF แนบไว้แล้ว',
      size: 'xs',
      color: '#0f766e',
    });
  }

  const footerButtons = [
    {
      type: 'button',
      style: 'primary',
      color: '#1d4ed8',
      action: {
        type: 'message',
        label: 'ติดตาม PO นี้',
        text: `เช็คสถานะใบสั่งซื้อ ${po.poNumber}`,
      },
    },
  ];

  if (po.pdfUrl) {
    footerButtons.push({
      type: 'button',
      style: 'secondary',
      action: { type: 'uri', label: 'ดาวน์โหลด PDF', uri: po.pdfUrl },
    });
  }

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: '#1d4ed8',
      contents: [
        { type: 'text', text: 'สถานะใบสั่งซื้อ', size: 'xs', color: '#bfdbfe' },
        { type: 'text', text: po.poNumber, weight: 'bold', size: 'lg', color: '#ffffff' },
        {
          type: 'text',
          text: statusLabel,
          size: 'sm',
          weight: 'bold',
          color: statusColor(po.status),
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: 'อัปเดตล่าสุด', flex: 2, size: 'sm', color: '#64748b' },
            {
              type: 'text',
              text: dayjs(po.updatedAt || po.createdAt).format('DD MMM YYYY HH:mm'),
              flex: 4,
              size: 'sm',
              color: '#0f172a',
            },
          ],
        },
        ...infoRows,
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: footerButtons,
    },
  };
}

function buildQuickReplyItems(items = []) {
  return items
    .filter((item) => item && (item.postbackData || item.text))
    .slice(0, 13)
    .map((item) => {
      if (item.postbackData) {
        return {
          type: 'action',
          action: {
            type: 'postback',
            label: item.label || item.displayText || 'เลือก',
            data: item.postbackData,
            displayText: item.displayText || item.label || 'เลือก',
          },
        };
      }
      return {
        type: 'action',
        action: {
          type: 'message',
          label: item.label || item.text,
          text: item.text,
        },
      };
    });
}

async function loadWeatherScenario(name = 'ok') {
  const module = await import(`../services/advice/mocks/${name}.json`, { with: { type: 'json' } });
  return module.default || module;
}

// --- Main menu (clean vertical bubble, size mega) -------------------------
function buildMainMenuFlex() {
  const header = {
    type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#0f172a', contents: [
      { type: 'text', text: 'เมนูหลัก', weight: 'bold', size: 'lg', color: '#ffffff' },
      { type: 'text', text: 'บางฟีเจอร์จะเปิดใช้งานเร็วๆ นี้', size: 'sm', color: '#cbd5e1' },
    ],
  };
  const primaryButtons = [
    { type: 'button', style: 'primary', action: { type: 'postback', label: 'รายงานวันนี้', data: 'open_daily_report', displayText: 'รายงานวันนี้' }, color: '#16a34a' },
    { type: 'button', style: 'secondary', action: { type: 'postback', label: 'เลือกรายงาน', data: 'coming_soon?feature=find_report', displayText: 'เลือกรายงาน' } },
    { type: 'button', style: 'secondary', action: { type: 'postback', label: 'เชื่อมต่อบริษัท', data: 'coming_soon?feature=connect_company', displayText: 'เชื่อมต่อบริษัท' } },
  ];
  const secondaryButtons = [
    { type: 'button', style: 'secondary', action: { type: 'postback', label: 'ล่าสุด', data: 'open_daily_report', displayText: 'ล่าสุด' } },
    { type: 'button', style: 'secondary', action: { type: 'postback', label: 'ตั้งค่า', data: 'coming_soon?feature=settings', displayText: 'ตั้งค่า' } },
    { type: 'button', style: 'secondary', action: { type: 'postback', label: 'ติดต่อเรา', data: 'coming_soon?feature=contact', displayText: 'ติดต่อเรา' } },
  ];
  return {
    type: 'bubble', size: 'mega',
    header,
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', contents: [
        { type: 'box', layout: 'vertical', spacing: 'sm', contents: primaryButtons },
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'sm', contents: secondaryButtons },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: 'ขอบคุณที่ใช้งาน ระบบกำลังพัฒนาให้ดีขึ้นเสมอ 🙏', size: 'xs', color: '#64748b', wrap: true },
      ],
    },
  };
}

function replyMainMenu(ev) {
  const bubble = buildMainMenuFlex();
  return replyFlex(ev.replyToken, 'เมนูหลัก (บางฟีเจอร์จะเปิดเร็วๆ นี้)', bubble);
}

async function replyWeatherAdvice(ev, scenario) {
  if (!ev.replyToken) return null;
  try {
    const data = await loadWeatherScenario(scenario || 'ok');
    const advice = buildWeatherAdvice(data);
    const flex = buildFlexWeatherAdvice(advice);
    const textMessage = advice.formattedText.length > 1100
      ? `${advice.formattedText.slice(0, 1100)}…`
      : advice.formattedText;
    return replyFlex(ev.replyToken, 'พยากรณ์อากาศพร้อมคำแนะนำ', flex, [{ type: 'text', text: textMessage }]);
  } catch (err) {
    console.error('[WEBHOOK] weather advice error:', err?.message || err);
    return replyText(ev.replyToken, 'ขออภัย ไม่สามารถสร้างคำแนะนำอากาศได้ในขณะนี้');
  }
}

async function replyStockAlertMessage(ev, options = {}) {
  if (!ev.replyToken) return null;
  try {
    const rawAlert = buildStockAlert(stockMock.items, null, {
      baseUrl: BASE_URL_CLEAN || '',
      companyId: options.companyId || process.env.DEFAULT_COMPANY_ID || 'demo',
      uuid: getUserId(ev) || '',
    });
    const alert = rawAlert.items ? rawAlert : rawAlert.groups?.[0] || rawAlert;
    const flex = buildFlexStockAlert(alert);
    const textBlock = alert.formattedText || rawAlert.formattedText || 'ไม่มีรายการแจ้งเตือน';
    const textMessage = textBlock.length > 1100 ? `${textBlock.slice(0, 1100)}…` : textBlock;
    return replyFlex(ev.replyToken, 'แจ้งเตือนสต็อก', flex, [{ type: 'text', text: textMessage }]);
  } catch (err) {
    console.error('[WEBHOOK] stock alert error:', err?.message || err);
    return replyText(ev.replyToken, 'ยังไม่สามารถดึงข้อมูลสต็อกได้ กรุณาลองใหม่');
  }
}

function buildActionCardBubble({
  title,
  subtitle = '',
  body = '',
  actions = [],
  color = '#1d4ed8',
}) {
  const headerContents = [
    { type: 'text', text: title || 'เมนู', size: 'lg', weight: 'bold', color: '#ffffff' },
  ];
  if (subtitle) {
    headerContents.push({ type: 'text', text: subtitle, size: 'sm', color: '#dbeafe' });
  }

  const bodyContents = [];
  if (Array.isArray(body)) {
    body.forEach((line) => {
      if (!line) return;
      bodyContents.push({ type: 'text', text: String(line), wrap: true, color: '#0f172a', size: 'sm' });
    });
  } else if (body) {
    bodyContents.push({ type: 'text', text: String(body), wrap: true, color: '#0f172a', size: 'sm' });
  } else {
    bodyContents.push({
      type: 'text',
      text: 'เลือกคำสั่งที่ต้องการจากปุ่มด้านล่าง',
      wrap: true,
      color: '#0f172a',
      size: 'sm',
    });
  }

  const footerContents = actions
    .filter((action) => action && action.label && (action.text || action.postbackData || action.uri))
    .map((action, idx) => {
      const style = action.style || (idx === 0 ? 'primary' : 'secondary');
      const button = { type: 'button', style, action: null };
      if (action.postbackData) {
        button.action = {
          type: 'postback',
          label: action.label,
          data: action.postbackData,
          displayText: action.displayText || action.label,
        };
      } else if (action.uri) {
        button.action = {
          type: 'uri',
          label: action.label,
          uri: action.uri,
        };
        if (action.altUri) {
          button.action.altUri = action.altUri;
        }
      } else {
        button.action = {
          type: 'message',
          label: action.label,
          text: action.text,
        };
      }
      if (action.color) button.color = action.color;
      if (action.height) button.height = action.height;
      return button;
    });

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: color,
      contents: headerContents,
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: bodyContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '20px',
      contents: footerContents,
    },
  };
}

function replyActionCard(replyToken, { title, subtitle, body, actions, color, altText }) {
  if (!replyToken) return null;
  const bubble = buildActionCardBubble({ title, subtitle, body, actions, color });
  return replyFlex(replyToken, altText || title || 'เมนู', bubble);
}

async function replyPurchaseOrderStatus(ev, text = '', options = {}) {
  if (!ev.replyToken) return null;
  const userId = getUserId(ev);
  const superAdmin = await isSuperAdminUser(userId);

  const poMatch = String(text || '').match(/(PO[-_\d]+)/i);
  const poNumber = options.poNumber || (poMatch ? poMatch[1].toUpperCase() : null);

  try {
    if (poNumber) {
      const po = await getPurchaseOrderByNumber(poNumber);
      if (!po) {
        return replyActionCard(ev.replyToken, {
          title: 'ไม่พบใบสั่งซื้อ',
          subtitle: poNumber,
          body: 'กรุณาตรวจสอบเลขใบสั่งซื้ออีกครั้ง หรือเลือกคำสั่งอื่นด้านล่าง',
          actions: [
            { label: 'ดูสถานะล่าสุด', text: 'สถานะ' },
            { label: 'กลับเมนูหลัก', text: 'เมนู' },
          ],
          color: '#1f2937',
          altText: `ไม่พบใบสั่งซื้อ ${poNumber}`,
        });
      }

      const bubble = buildPoStatusBubble(po, { showCompany: true });
      const quickReplyItems = buildQuickReplyItems([
        { label: 'สถานะล่าสุด', text: 'สถานะ' },
        { label: 'ค้นหา PO อื่น', text: 'เช็คสถานะใบสั่งซื้อ PO-' },
        { label: 'เมนู', text: 'เมนู' },
      ]);

      const followUp = {
        type: 'text',
        text: `สถานะล่าสุดของ ${po.poNumber}`,
        quickReply: { items: quickReplyItems },
      };

      return replyFlex(ev.replyToken, `สถานะ ${po.poNumber}`, bubble, [followUp]);
    }

    let targetCompanyId = options.companyId || null;
    if (!targetCompanyId && !superAdmin) {
      targetCompanyId = DEFAULT_COMPANY_ID || (await resolveCompanyIdFallback());
    }
    if (!targetCompanyId && !superAdmin) {
      // No company in database; guide user gracefully
      return replyText(ev.replyToken, 'ยังไม่มีข้อมูลบริษัทในระบบ');
    }

    let companyDoc = null;
    if (targetCompanyId) {
      try {
        companyDoc = await Company.findById(targetCompanyId).lean();
        if (!companyDoc && superAdmin) {
          return replyActionCard(ev.replyToken, {
            title: 'ไม่พบบริษัทที่เลือก',
            body: 'กรุณาเลือกบริษัทจากรายการ หรือค้นหาด้วยคำสั่งอื่น',
            actions: [
              { label: 'เลือกบริษัทอื่น', postbackData: 'po-status?company=menu', displayText: 'เลือกบริษัทอื่น' },
              { label: 'กลับเมนูหลัก', text: 'เมนู' },
            ],
            color: '#1f2937',
            altText: 'ไม่พบบริษัทที่เลือก',
          });
        }
      } catch {
        // ignore parse errors
      }
    }

    const query = {};
    if (targetCompanyId) query.companyId = targetCompanyId;

    const latest = await listPurchaseOrders(query, { limit: options.limit || 5 });
    if (!latest.length) {
      if (superAdmin) {
        return replyActionCard(ev.replyToken, {
          title: 'ยังไม่มีใบสั่งซื้อ',
          subtitle: companyDoc?.name || 'บริษัทที่เลือก',
          body: 'คุณสามารถเลือกบริษัทอื่นหรือสร้างใบสั่งซื้อใหม่ได้ทันที',
          actions: [
            { label: 'เลือกบริษัทอื่น', postbackData: 'po-status?company=menu', displayText: 'เลือกบริษัทอื่น' },
            { label: 'สร้างใบสั่งซื้อ', text: 'สร้างใบสั่งซื้อ' },
            { label: 'กลับเมนูหลัก', text: 'เมนู' },
          ],
          color: '#1f2937',
          altText: 'ยังไม่มีใบสั่งซื้อสำหรับบริษัทนี้',
        });
      }
      return replyActionCard(ev.replyToken, {
        title: 'ยังไม่มีใบสั่งซื้อในระบบ',
        body: 'เริ่มสร้างใบสั่งซื้อใหม่หรือกลับไปยังเมนูหลักได้เลย',
        actions: [
          { label: 'สร้างใบสั่งซื้อ', text: 'สร้างใบสั่งซื้อ' },
          { label: 'กลับเมนูหลัก', text: 'เมนู' },
        ],
        color: '#1f2937',
        altText: 'ยังไม่มีใบสั่งซื้อในระบบ',
      });
    }

    const bubbles = latest.slice(0, 10).map((po) => buildPoStatusBubble(po, { showCompany: !targetCompanyId }));
    const contents = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };

    const companyName = companyDoc?.name || (targetCompanyId ? '(ไม่ทราบชื่อบริษัท)' : 'ทุกบริษัท');
    const quickItems = [];

    if (superAdmin) {
      if (targetCompanyId) {
        quickItems.push({
          label: 'รีเฟรช',
          postbackData: `po-status?company=${targetCompanyId}`,
          displayText: `สถานะบริษัท ${companyName}`,
        });
        quickItems.push({
          label: 'บริษัทอื่น',
          postbackData: 'po-status?company=menu',
          displayText: 'เลือกบริษัทอื่น',
        });
      } else {
        quickItems.push({
          label: 'เลือกบริษัท',
          postbackData: 'po-status?company=menu',
          displayText: 'เลือกบริษัท',
        });
      }
    } else {
      quickItems.push({ label: 'รีเฟรช', text: 'สถานะ' });
    }

    quickItems.push({ label: 'ค้นหา PO', text: 'เช็คสถานะใบสั่งซื้อ PO-' });
    quickItems.push({ label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' });
    quickItems.push({ label: 'เมนู', text: 'เมนู' });

    const followUp = {
      type: 'text',
      text: `รายการสถานะใบสั่งซื้อ${targetCompanyId || !superAdmin ? '' : ' (ทุกบริษัท)'}`,
      quickReply: { items: buildQuickReplyItems(quickItems) },
    };

    const altText = targetCompanyId
      ? `สถานะใบสั่งซื้อของ ${companyName}`
      : 'สถานะใบสั่งซื้อล่าสุด';

    return replyFlex(ev.replyToken, altText, contents, [followUp]);
  } catch (err) {
    console.error('[WEBHOOK] replyPurchaseOrderStatus error:', err.message || err);
    return replyActionCard(ev.replyToken, {
      title: 'เกิดข้อผิดพลาด',
      body: 'ไม่สามารถตรวจสอบสถานะใบสั่งซื้อได้ กรุณาลองใหม่อีกครั้ง หรือเลือกคำสั่งอื่น',
      actions: [
        { label: 'ดูสถานะล่าสุด', text: 'สถานะ' },
        { label: 'กลับเมนูหลัก', text: 'เมนู' },
      ],
      color: '#b91c1c',
      altText: 'ตรวจสอบสถานะใบสั่งซื้อไม่สำเร็จ',
    });
  }
}

async function replyPoCreationFlex(ev) {
  if (!ev.replyToken) return null;
  const userId = getUserId(ev);
  if (await isSuperAdminUser(userId)) {
    return replySuperAdminPoStart(ev);
  }
  const params = new URLSearchParams();
  if (DEFAULT_COMPANY_ID) params.set('companyId', DEFAULT_COMPANY_ID);
  if (userId) params.set('uuid', userId);
  const liffPoUrl = `${BASE_URL_CLEAN || ''}/liff/po${params.toString() ? `?${params.toString()}` : ''}`;

  const contents = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'สร้างใบสั่งซื้อ',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
        },
        {
          type: 'text',
          text: 'ขั้นตอนสำหรับทีมจัดซื้อ',
          size: 'sm',
          color: '#dbeafe',
        },
      ],
      paddingAll: '16px',
      backgroundColor: '#1d4ed8',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '1.', flex: 0, weight: 'bold', color: '#1e293b' },
            {
              type: 'text',
              text: 'เตรียมใบขอซื้อ (PR) หรือรายละเอียดผู้จัดจำหน่าย',
              wrap: true,
              color: '#0f172a',
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '2.', flex: 0, weight: 'bold', color: '#1e293b' },
            {
              type: 'text',
              text: 'กรอกจำนวนสินค้า ราคา และวันที่คาดว่าจะจัดส่ง',
              wrap: true,
              color: '#0f172a',
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '3.', flex: 0, weight: 'bold', color: '#1e293b' },
            {
              type: 'text',
              text: 'กดสร้างใบสั่งซื้อเพื่อส่งอีเมลแจ้งผู้จัดจำหน่ายอัตโนมัติ',
              wrap: true,
              color: '#0f172a',
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          action: { type: 'uri', label: 'เปิด PO (LIFF)', uri: liffPoUrl },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'เริ่มกรอกผ่านแชท', data: 'po-create?step=start', displayText: 'PO ใหม่' },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: 'ดูใบขอซื้อ (PR)', text: 'เปิดใบขอซื้อ' },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'postback', label: 'ดูตัวอย่างข้อความ', data: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        },
      ],
    },
  };

  const quickReplyItems = buildQuickReplyItems([
    { label: 'เริ่มกรอก', postbackData: 'po-create?step=start', displayText: 'PO ใหม่' },
    { label: 'ตัวอย่าง', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
    { label: 'สถานะ PO', text: 'สถานะ' },
    { label: 'เมนู', text: 'เมนู' },
  ]);

  const followUp = {
    type: 'text',
    text: 'เลือกรูปแบบที่ต้องการต่อได้เลย',
    quickReply: { items: quickReplyItems },
  };

  return replyFlex(ev.replyToken, 'ขั้นตอนสร้างใบสั่งซื้อ', contents, [followUp]);
}

async function replyPoDraftInstructions(ev) {
  if (!ev.replyToken) return null;

  const contents = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text', text: 'สร้างใบสั่งซื้อผ่านแชท', color: '#ffffff', size: 'lg', weight: 'bold' },
        { type: 'text', text: 'ทำตามขั้นตอนสั้น ๆ ด้านล่าง', color: '#cbd5f5', size: 'sm' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '1', flex: 0, size: 'sm', color: '#0f172a', weight: 'bold' },
            {
              type: 'text',
              text: 'พิมพ์หรือก๊อปปี้ข้อความตัวอย่างแล้วเปลี่ยนข้อมูลสินค้า/ผู้จัดจำหน่ายตามจริง',
              wrap: true,
              size: 'sm',
              color: '#0f172a',
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '2', flex: 0, size: 'sm', color: '#0f172a', weight: 'bold' },
            {
              type: 'text',
              text: 'ระบุจำนวนสินค้า ราคา และกำหนดส่งให้ครบ ระบบจะบันทึกและสร้างเลข PO ให้อัตโนมัติ',
              wrap: true,
              size: 'sm',
              color: '#0f172a',
            },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            { type: 'text', text: '3', flex: 0, size: 'sm', color: '#0f172a', weight: 'bold' },
            {
              type: 'text',
              text: 'ระบบจะส่งไฟล์ PDF และแจ้งเตือนสถานะให้ในห้องนี้เมื่อสร้างเสร็จ',
              wrap: true,
              size: 'sm',
              color: '#0f172a',
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1d4ed8',
          action: { type: 'postback', data: 'po-create?step=template', label: 'เรียกดูตัวอย่างข้อความ', displayText: 'PO ตัวอย่าง' },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: 'ขั้นตอนถัดไป', text: 'เช็คสถานะ' },
        },
      ],
    },
  };

  const followUp = {
    type: 'text',
    text: 'พร้อมแล้วแตะ "เรียกดูตัวอย่างข้อความ" เพื่อเริ่มต้นได้เลย',
    quickReply: {
      items: buildQuickReplyItems([
        { label: 'ตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        { label: 'สถานะ PO', text: 'สถานะ' },
        { label: 'เมนู', text: 'เมนู' },
      ]),
    },
  };

  return replyFlex(ev.replyToken, 'สร้างใบสั่งซื้อผ่านแชท', contents, [followUp]);
}

function buildCatalogSummaryLines(vendor) {
  const lines = vendor.products.map((product, idx) => `${idx + 1}. ${product.name}`);
  return lines;
}

function findCatalogVendor(vendorId) {
  return SUPER_ADMIN_SUPPLIER_CATALOG.find((entry) => entry.id === vendorId) || null;
}

function findCatalogProduct(vendorId, productId) {
  const vendor = findCatalogVendor(vendorId);
  if (!vendor) return null;
  return vendor.products.find((item) => item.id === productId) || null;
}

async function ensureCatalogVendor(vendorInfo, actor = 'system') {
  if (!vendorInfo) return null;
  const existing = await Vendor.findOne({ name: vendorInfo.name }).lean();
  if (existing) return existing;
  return createVendor(
    {
      name: vendorInfo.name,
      address: vendorInfo.address,
      taxId: vendorInfo.taxId,
      phone: vendorInfo.phone,
      productCategories: vendorInfo.category ? [vendorInfo.category] : [],
      meta: { source: 'super-admin-catalog' },
    },
    actor
  );
}

async function replySuperAdminPoStart(ev) {
  const actions = [
    { label: 'เลือกบริษัท', postbackData: 'po-create?step=super-company', displayText: 'เลือกบริษัท' },
    { label: 'ดูขั้นตอนแบบกรอกข้อความ', postbackData: 'po-create?step=start', displayText: 'สร้างแบบกรอกข้อความ' },
    { label: 'ดูตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
  ];

  return replyActionCard(ev.replyToken, {
    title: 'สร้างใบสั่งซื้อ (Super Admin)',
    subtitle: 'เลือกบริษัทและผู้จัดจำหน่ายจากรายการสำเร็จรูปได้ทันที',
    actions,
    color: '#1d4ed8',
    altText: 'สร้างใบสั่งซื้อ (Super Admin)',
  });
}

async function replySuperAdminCompanySelect(ev) {
  if (!ev.replyToken) return null;
  const companies = await Company.find().sort({ name: 1 }).lean();
  if (!companies.length) {
    return replyText(ev.replyToken, 'ยังไม่มีบริษัทในระบบสำหรับการสร้างใบสั่งซื้อ');
  }

  const topActions = companies.slice(0, 3).map((company) => ({
    label: company.name.slice(0, 20),
    postbackData: `po-create?step=super-vendor&company=${company._id.toString()}`,
    displayText: `บริษัท ${company.name}`,
  }));

  const bubble = buildActionCardBubble({
    title: 'เลือกบริษัท',
    subtitle: 'Super Admin สามารถเลือกได้ทุกบริษัท',
    body: companies.slice(0, 10).map((company, idx) => `${idx + 1}. ${company.name}`),
    actions: topActions,
    color: '#1d4ed8',
  });

  const quickReplyItems = buildQuickReplyItems(
    companies.slice(0, 13).map((company) => ({
      label: company.name.slice(0, 20),
      postbackData: `po-create?step=super-vendor&company=${company._id.toString()}`,
      displayText: `บริษัท ${company.name}`,
    }))
  );

  const followUp = {
    type: 'text',
    text: 'เลือกบริษัทจากปุ่มลัดด้านล่าง หรือพิมพ์ชื่อบริษัทได้เลย',
    quickReply: { items: quickReplyItems },
  };

  return replyFlex(ev.replyToken, 'เลือกบริษัทสำหรับสร้าง PO', bubble, [followUp]);
}

async function replySuperAdminVendorSelect(ev, companyId) {
  if (!ev.replyToken) return null;
  const company = await Company.findById(companyId).lean();
  if (!company) {
    return replyText(ev.replyToken, 'ไม่พบบริษัทที่เลือก โปรดลองใหม่');
  }

  const bubbles = SUPER_ADMIN_SUPPLIER_CATALOG.map((vendor) => ({
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text', text: vendor.category, size: 'xs', color: '#dbeafe' },
        { type: 'text', text: vendor.name, size: 'md', weight: 'bold', color: '#ffffff' },
        { type: 'text', text: vendor.phone || '', size: 'xs', color: '#bfdbfe' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: buildCatalogSummaryLines(vendor).map((line) => ({
        type: 'text',
        text: line,
        wrap: true,
        color: '#0f172a',
        size: 'sm',
      })),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          action: {
            type: 'postback',
            label: 'เลือกผู้จัดจำหน่าย',
            data: `po-create?step=super-product&company=${companyId}&vendor=${vendor.id}`,
            displayText: `เลือก ${vendor.name}`,
          },
        },
      ],
    },
  }));

  const payload = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };

  const quickReplyItems = buildQuickReplyItems(
    SUPER_ADMIN_SUPPLIER_CATALOG.map((vendor) => ({
      label: vendor.name.slice(0, 20),
      postbackData: `po-create?step=super-product&company=${companyId}&vendor=${vendor.id}`,
      displayText: `ผู้จัดจำหน่าย ${vendor.name}`,
    }))
  );

  const followUp = {
    type: 'text',
    text: `บริษัทที่เลือก: ${company.name}\nเลือกผู้จัดจำหน่ายที่ต้องการ`,
    quickReply: { items: quickReplyItems },
  };

  return replyFlex(ev.replyToken, 'เลือกผู้จัดจำหน่าย', payload, [followUp]);
}

async function replySuperAdminProductSelect(ev, companyId, vendorId) {
  if (!ev.replyToken) return null;
  const vendor = findCatalogVendor(vendorId);
  if (!vendor) {
    return replyText(ev.replyToken, 'ไม่พบผู้จัดจำหน่ายที่เลือก');
  }

  const bubbles = vendor.products.map((product) => ({
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      backgroundColor: '#1d4ed8',
      contents: [
        { type: 'text', text: vendor.name, size: 'xs', color: '#bfdbfe' },
        { type: 'text', text: product.name, size: 'md', weight: 'bold', color: '#ffffff' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `หมวดหมู่: ${vendor.category}`, size: 'sm', color: '#0f172a' },
        { type: 'text', text: `หน่วย: ${product.unit}`, size: 'sm', color: '#0f172a' },
        { type: 'text', text: `ราคาโดยประมาณ: ${Number(product.unitPrice).toLocaleString('th-TH')} บาท`, size: 'sm', color: '#0f172a' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          action: {
            type: 'postback',
            label: 'เลือกสินค้า',
            data: `po-create?step=super-qty&company=${companyId}&vendor=${vendorId}&product=${product.id}`,
            displayText: `เลือก ${product.name}`,
          },
        },
      ],
    },
  }));

  const payload = bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles };

  const quickReplyItems = buildQuickReplyItems(
    vendor.products.map((product) => ({
      label: product.name.slice(0, 20),
      postbackData: `po-create?step=super-qty&company=${companyId}&vendor=${vendorId}&product=${product.id}`,
      displayText: `เลือก ${product.name}`,
    }))
  );

  const followUp = {
    type: 'text',
    text: 'เลือกจำนวนที่ต้องการสั่งซื้อ',
    quickReply: { items: quickReplyItems },
  };

  return replyFlex(ev.replyToken, 'เลือกสินค้า', payload, [followUp]);
}

async function replySuperAdminQuantitySelect(ev, companyId, vendorId, productId) {
  if (!ev.replyToken) return null;
  const product = findCatalogProduct(vendorId, productId);
  const vendor = findCatalogVendor(vendorId);
  if (!product || !vendor) {
    return replyText(ev.replyToken, 'ไม่พบข้อมูลสินค้า โปรดลองใหม่');
  }

  const actions = SUPER_ADMIN_QUANTITY_OPTIONS.slice(0, 3).map((qty) => ({
    label: `${qty} ${product.unit}`,
    postbackData: `po-create?step=super-create&company=${companyId}&vendor=${vendorId}&product=${productId}&qty=${qty}`,
    displayText: `${product.name} ${qty} ${product.unit}`,
  }));

  const bubble = buildActionCardBubble({
    title: 'เลือกจำนวนสั่งซื้อ',
    subtitle: `${product.name} · ${vendor.name}`,
    body: [
      `ราคาโดยประมาณ: ${Number(product.unitPrice).toLocaleString('th-TH')} บาท/ ${product.unit}`,
      'เลือกจำนวนที่ต้องการจากปุ่มด้านล่าง',
    ],
    actions,
    color: '#0f172a',
  });

  const quickReplyItems = buildQuickReplyItems(
    SUPER_ADMIN_QUANTITY_OPTIONS.map((qty) => ({
      label: `${qty} ${product.unit}`,
      postbackData: `po-create?step=super-create&company=${companyId}&vendor=${vendorId}&product=${productId}&qty=${qty}`,
      displayText: `${product.name} ${qty} ${product.unit}`,
    }))
  );

  const followUp = {
    type: 'text',
    text: 'เลือกจำนวนจากปุ่มลัดด้านล่าง หากต้องการจำนวนอื่นสามารถปรับแก้ในระบบ ERP ได้ภายหลัง',
    quickReply: { items: quickReplyItems },
  };

  return replyFlex(ev.replyToken, 'เลือกจำนวนสั่งซื้อ', bubble, [followUp]);
}

async function handleSuperAdminPoCreate(ev, companyId, vendorId, productId, qtyParam) {
  if (!ev.replyToken) return null;
  const product = findCatalogProduct(vendorId, productId);
  const vendorInfo = findCatalogVendor(vendorId);
  if (!product || !vendorInfo) {
    return replyText(ev.replyToken, 'ไม่สามารถสร้างใบสั่งซื้อได้ (ไม่พบสินค้า/ผู้จัดจำหน่าย)');
  }

  const company = await Company.findById(companyId).lean();
  if (!company) {
    return replyText(ev.replyToken, 'ไม่พบบริษัทที่เลือก');
  }

  const quantity = qtyParam ? Number(qtyParam) : 1;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const actor = `line:${getUserId(ev) || 'super-admin'}`;

  const vendorDoc = await ensureCatalogVendor(vendorInfo, actor);
  const vendorIdResolved = vendorDoc?._id ? vendorDoc._id.toString() : vendorDoc?.id;
  if (!vendorIdResolved) {
    return replyText(ev.replyToken, 'ไม่สามารถสร้างใบสั่งซื้อได้ (vendor)');
  }

  const expectedDeliveryDate = dayjs().add(3, 'day').toDate();

  try {
    const po = await createPurchaseOrder(
      {
        companyId: company._id,
        vendorId: vendorIdResolved,
        currency: 'THB',
        items: [
          {
            itemName: product.name,
            sku: product.id,
            quantity: safeQuantity,
            unit: product.unit,
            unitPrice: Number(product.unitPrice) || 0,
          },
        ],
        expectedDeliveryDate,
        remarks: `สร้างจาก Super Admin (${vendorInfo.name})`,
      },
      actor
    );

    return replyPurchaseOrderStatus(ev, '', { poNumber: po.poNumber });
  } catch (err) {
    console.error('[WEBHOOK] super admin create PO failed:', err);
    return replyText(ev.replyToken, 'ไม่สามารถสร้างใบสั่งซื้อได้ ลองใหม่อีกครั้งหรือตรวจสอบข้อมูล');
  }
}

const PO_TEMPLATE_TEXT = [
  'PO ใหม่',
  'บริษัท: <ชื่อบริษัท>',
  'ผู้จัดจำหน่าย: <ชื่อผู้จัดจำหน่าย>',
  'ส่งภายใน: <วันที่ส่งมอบ เช่น 30/09/2024>',
  'รายการสินค้า:',
  '1) <ชื่อสินค้า> x <จำนวน> <หน่วย> @ <ราคา/หน่วย>',
  '2) <เพิ่มรายการตามต้องการ>',
  'หมายเหตุ: <ระบุเงื่อนไขการชำระเงินหรือข้อมูลเพิ่มเติม>',
].join('\n');

async function replyPoDraftTemplate(ev) {
  if (!ev.replyToken) return null;

  const sampleItems = [
    'PO ใหม่',
    'บริษัท: NILA ENERGY CO., LTD.',
    'ผู้จัดจำหน่าย: Bangkok Asphalt Partner',
    'ส่งภายใน: 30/09/2024',
    'รายการสินค้า:',
    '1) ยางมะตอยชนิด 60/70 x 20 ตัน @ 15,200',
    '2) ค่าขนส่งพิเศษ @ 5,000',
    'หมายเหตุ: เงื่อนไขเครดิต 30 วัน หลังรับของ',
  ];

  const contents = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      backgroundColor: '#1d4ed8',
      contents: [
        { type: 'text', text: 'ตัวอย่างข้อความสร้าง PO', size: 'lg', color: '#ffffff', weight: 'bold' },
        { type: 'text', text: 'ปรับแก้ข้อมูลแล้วส่งกลับในห้องแชทนี้', size: 'sm', color: '#dbeafe' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: sampleItems.map((line) => ({
        type: 'text',
        text: line,
        size: 'sm',
        wrap: true,
        color: '#0f172a',
      })),
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          action: {
            type: 'message',
            label: 'ใช้ข้อความตัวอย่าง',
            text: PO_TEMPLATE_TEXT,
          },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: 'กลับเมนู', text: 'เมนู' },
        },
      ],
    },
  };

  const followUp = {
    type: 'text',
    text: 'กด "ใช้ข้อความตัวอย่าง" เพื่อคัดลอก จากนั้นแก้ไขรายละเอียดก่อนส่งกลับมา',
    quickReply: {
      items: buildQuickReplyItems([
        { label: 'ส่งตามตัวอย่าง', text: PO_TEMPLATE_TEXT },
        { label: 'สถานะ PO', text: 'สถานะ' },
        { label: 'เมนู', text: 'เมนู' },
      ]),
    },
  };

  return replyFlex(ev.replyToken, 'ตัวอย่างข้อความสร้างใบสั่งซื้อ', contents, [followUp]);
}

async function replyCompanyStatusMenu(ev) {
  if (!ev.replyToken) return null;

  const companies = await Company.find().sort({ name: 1 }).lean();
  if (!companies.length) {
    return replyActionCard(ev.replyToken, {
      title: 'ยังไม่มีบริษัทในระบบ',
      body: 'กรุณาเพิ่มข้อมูลบริษัทในระบบก่อน เพื่อใช้งานฟังก์ชันนี้',
      actions: [{ label: 'กลับเมนูหลัก', text: 'เมนู' }],
      color: '#1f2937',
      altText: 'ยังไม่มีบริษัทในระบบ',
    });
  }

  const listContents = companies.slice(0, 10).map((company, idx) => ({
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: `${idx + 1}.`, flex: 0, size: 'sm', color: '#1e293b' },
      { type: 'text', text: company.name, size: 'sm', color: '#0f172a', wrap: true },
    ],
  }));

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: '#1f2937',
      contents: [
        { type: 'text', text: 'เลือกบริษัทเพื่อตรวจสถานะ PO', size: 'lg', weight: 'bold', color: '#ffffff' },
        { type: 'text', text: 'แตะชื่อบริษัทจากแถบด้านล่าง', size: 'sm', color: '#e5e7eb' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: listContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1d4ed8',
          action: { type: 'postback', label: 'ดูทุกบริษัท', data: 'po-status?company=all', displayText: 'สถานะทุกบริษัท' },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: 'ค้นหา PO เฉพาะ', text: 'เช็คสถานะใบสั่งซื้อ PO-' },
        },
      ],
    },
  };

  const quickReplyItems = companies.slice(0, 11).map((company) => ({
    type: 'action',
    action: {
      type: 'postback',
      label: company.name.slice(0, 20),
      data: `po-status?company=${company._id}`,
      displayText: `สถานะบริษัท ${company.name}`,
    },
  }));

  if (companies.length > 11) {
    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'message',
        label: 'ค้นหา PO',
        text: 'เช็คสถานะใบสั่งซื้อ PO-',
      },
    });
  }

  quickReplyItems.push({
    type: 'action',
    action: {
      type: 'message',
      label: 'เมนู',
      text: 'เมนู',
    },
  });

  const followUp = {
    type: 'text',
    text: 'เลือกบริษัทที่ต้องการตรวจสอบ',
    quickReply: { items: quickReplyItems.slice(0, 13) },
  };

  return replyFlex(ev.replyToken, 'เลือกบริษัทเพื่อตรวจสถานะใบสั่งซื้อ', bubble, [followUp]);
}

async function tryCreatePoFromFreeform(ev, rawText) {
  const userId = getUserId(ev);
  if (!(await isSuperAdminUser(userId))) return false;

  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length || !/^PO\s*ใหม่/i.test(lines[0])) return false;

  let companyName = '';
  let vendorName = '';
  let expectedStr = '';
  let note = '';
  let inItems = false;
  const items = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.startsWith('บริษัท')) {
      companyName = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (lower.startsWith('ผู้จัดจำหน่าย')) {
      vendorName = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (lower.startsWith('ส่งภายใน')) {
      expectedStr = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (lower.startsWith('รายการ')) {
      inItems = true;
      continue;
    }
    if (lower.startsWith('หมายเหตุ')) {
      note = line.split(':').slice(1).join(':').trim();
      inItems = false;
      continue;
    }

    if (inItems && /^\d+\)/.test(line)) {
      const match = line.match(/^\d+\)\s*(.+?)\s+x\s*([\d.,]+)\s*([^\s@]+)?\s*@\s*([\d.,]+)/i);
      if (match) {
        const itemName = match[1].trim();
        if (hasPlaceholder(itemName)) continue;
        const quantity = parseNumber(match[2]);
        const unit = (match[3] || 'หน่วย').trim();
        const unitPrice = parseNumber(match[4]);
        if (itemName && Number.isFinite(quantity) && quantity > 0) {
          items.push({
            itemName,
            quantity,
            unit,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          });
        }
      }
    }
  }

  if (hasPlaceholder(note) || note.toLowerCase().includes('ข้อมูลเพิ่มเติม')) {
    note = '';
  }

  if (!vendorName || hasPlaceholder(vendorName) || vendorName.toLowerCase().includes('ชื่อผู้จัดจำหน่าย')) {
    await replyActionCard(ev.replyToken, {
      title: 'ข้อมูลยังไม่ครบถ้วน',
      body: 'กรุณาระบุชื่อผู้จัดจำหน่ายจริงก่อนส่ง เพื่อให้ระบบสร้างใบสั่งซื้อได้ถูกต้อง',
      actions: [
        { label: 'ดูตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        { label: 'กลับเมนูหลัก', text: 'เมนู' },
      ],
      color: '#1f2937',
      altText: 'กรุณาระบุชื่อผู้จัดจำหน่าย',
    });
    return true;
  }

  if (!items.length) {
    await replyActionCard(ev.replyToken, {
      title: 'ยังไม่มีรายการสินค้า',
      body: 'กรุณาใส่รายละเอียดสินค้า เช่น ชื่อ จำนวน และราคา ให้ครบถ้วนก่อนส่ง',
      actions: [
        { label: 'ดูตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        { label: 'กลับเมนูหลัก', text: 'เมนู' },
      ],
      color: '#1f2937',
      altText: 'กรุณาระบุรายการสินค้าให้ครบถ้วน',
    });
    return true;
  }

  const actor = `line:${userId || 'unknown'}`;

  let company = null;
  if (companyName) {
    if (hasPlaceholder(companyName) || companyName.toLowerCase().includes('ชื่อบริษัท')) {
      await replyActionCard(ev.replyToken, {
        title: 'กรุณาระบุชื่อบริษัท',
        body: 'ตรวจสอบให้แน่ใจว่าคุณได้เปลี่ยนชื่อบริษัทในข้อความแล้วก่อนส่ง',
        actions: [
          { label: 'ดูตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
          { label: 'กลับเมนูหลัก', text: 'เมนู' },
        ],
        color: '#1f2937',
        altText: 'กรุณาแทนที่ชื่อบริษัท',
      });
      return true;
    }
    const regex = new RegExp(`^${escapeRegex(companyName)}$`, 'i');
    company = await Company.findOne({ name: regex }).lean();
  }
  if (!company && DEFAULT_COMPANY_ID) {
    company = await Company.findById(DEFAULT_COMPANY_ID).lean();
  }
  if (!company) {
    const fallbackId = await resolveCompanyIdFallback();
    if (fallbackId) {
      company = await Company.findById(fallbackId).lean();
    } else {
      await replyActionCard(ev.replyToken, {
        title: 'ยังไม่มีข้อมูลบริษัท',
        body: 'ระบบยังไม่มีบริษัทให้ตรวจสอบสถานะ',
        actions: [ { label: 'กลับเมนูหลัก', text: 'เมนู' } ],
        color: '#1f2937',
        altText: 'ไม่มีบริษัท',
      });
      return true;
    }
  }

  let vendor = null;
  if (vendorName) {
    const regex = new RegExp(`^${escapeRegex(vendorName)}$`, 'i');
    vendor = await Vendor.findOne({ name: regex }).lean();
  }

  if (!vendor) {
    vendor = await createVendor({ name: vendorName }, actor);
  }

  if (hasPlaceholder(expectedStr) || expectedStr.toLowerCase().includes('วันที่ส่งมอบ')) {
    expectedStr = '';
  }

  const expectedDate = parseDateInput(expectedStr);
  const vendorId = vendor._id ? vendor._id.toString() : vendor.id;

  const payload = {
    companyId: company._id,
    vendorId,
    expectedDeliveryDate: expectedDate || undefined,
    items,
    note,
  };

  try {
    const po = await createPurchaseOrder(payload, actor);
    console.log('[LINE][PO CREATE]', { poNumber: po.poNumber, actor });
    await replyPurchaseOrderStatus(ev, '', { poNumber: po.poNumber });
    return true;
  } catch (err) {
    console.error('[LINE][PO CREATE ERR]', err);
    await replyActionCard(ev.replyToken, {
      title: 'สร้างใบสั่งซื้อไม่สำเร็จ',
      body: 'กรุณาตรวจสอบข้อมูลให้ครบถ้วนก่อนลองอีกครั้ง หรือดูตัวอย่างข้อความเพื่อเปรียบเทียบ',
      actions: [
        { label: 'ดูตัวอย่างข้อความ', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        { label: 'กลับเมนูหลัก', text: 'เมนู' },
      ],
      color: '#b91c1c',
      altText: 'สร้างใบสั่งซื้อไม่สำเร็จ',
    });
    return true;
  }
}

async function handleImage(ev) {
  const userId = getUserId(ev);
  const messageId = ev.message?.id;
  if (!userId || !messageId) return;

  try {
    const { filePath } = await downloadImage(messageId);
    await saveImageMeta({
      userId,
      messageId,
      timestamp: ev.timestamp,
      imagePath: filePath,
      rawEvent: ev,
    });
  } catch (err) {
    console.error('[WEBHOOK] handleImage error:', err.message);
    if (ev.replyToken) {
      await replyText(ev.replyToken, 'ไม่สามารถดาวน์โหลดรูปได้ กรุณาลองอีกครั้ง');
    }
  }
}

async function handleLocation(ev) {
  const userId = getUserId(ev);
  const messageId = ev.message?.id;
  if (!userId || !messageId) return;

  const { latitude, longitude, address } = ev.message || {};

  try {
    await saveLocationMeta({
      userId,
      messageId,
      timestamp: ev.timestamp,
      location: { latitude, longitude, address },
      rawEvent: ev,
    });

    if (ev.replyToken && latitude !== undefined && longitude !== undefined) {
      try {
        const summary = await fetchWeatherSummary(latitude, longitude, address);
        const text = formatWeatherText(summary);
        await replyText(ev.replyToken, text);
      } catch (err) {
        console.error('[WEBHOOK] weather reply error:', err.message);
        await replyText(ev.replyToken, 'บันทึกตำแหน่งแล้ว แต่ไม่สามารถดึงพยากรณ์อากาศได้');
      }
    }
  } catch (err) {
    console.error('[WEBHOOK] handleLocation error:', err.message);
    if (ev.replyToken) {
      await replyText(ev.replyToken, 'ไม่สามารถบันทึกตำแหน่งได้ กรุณาลองอีกครั้ง');
    }
  }
}

function shouldReplyWeather(text) {
  if (!text) return false;
  return WEATHER_KEYWORDS.some((re) => re.test(text));
}

async function replyWeather(ev) {
  const userId = getUserId(ev);
  if (!ev.replyToken) return null;

  let locationDoc = null;
  if (userId) {
    locationDoc = await LineMedia.findOne({ userId, type: 'location' })
      .sort({ timestamp: -1 })
      .lean();
  }

  let latitude;
  let longitude;
  let address = '';
  let note = '';

  if (locationDoc?.location?.latitude !== undefined && locationDoc?.location?.longitude !== undefined) {
    latitude = locationDoc.location.latitude;
    longitude = locationDoc.location.longitude;
    address = locationDoc.location.address || '';
  } else {
    latitude = DEFAULT_WEATHER_LAT;
    longitude = DEFAULT_WEATHER_LNG;
    note = 'ยังไม่เคยแชร์ตำแหน่ง – ใช้ค่าพื้นฐานกรุงเทพฯ';
  }

  try {
    const summary = await fetchWeatherSummary(latitude, longitude, address);
    const text = formatWeatherText(summary, note);
    return replyText(ev.replyToken, text);
  } catch (err) {
    console.error('[WEBHOOK] fetch weather error:', err.message);
    return replyText(ev.replyToken, 'ดึงพยากรณ์อากาศไม่สำเร็จ กรุณาลองใหม่หรือตรวจสอบอีกครั้ง');
  }
}

// ============ Router-level error handler (กันตกเป็น 500 เงียบ ๆ) ============
router.use((err, req, res, next) => {
  console.error('[WEBHOOK][ERRMW]', err);
  if (!res.headersSent) res.status(200).send('ok'); // กัน 500
});

export default router;
