// src/routes/webhook.js
import { Router } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { replyText, replyQuickMenu, replyFlex, pushLineMessage, getUserProfile } from '../services/line.js';
import LineChatLog from '../models/lineChatLog.model.js';
import LineMedia from '../models/lineMedia.model.js';
import Company from '../models/Company.js';
import Vendor from '../models/Vendor.js';
import {
  buildConsentUrl,
  ensureConsentRecord,
  shouldPromptConsent,
  updateConsentPrompted,
  fetchConsent,
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

const router = Router();

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
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || process.env.APP_PORTAL_URL || 'https://nila-portal.example.com';
const PORTAL_BASE = PORTAL_BASE_URL.replace(/\/$/, '');
const PROCUREMENT_SAFETY_DAYS = Number(process.env.PROCUREMENT_SAFETY_DAYS || 3);

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
    return hmac === signature;
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
  console.log('✅ Received event from LINE');
  // LOG หัวข้อเบื้องต้น (ช่วยดีบัก 500)
  console.log('[WEBHOOK][HEADERS]', {
    'content-type': req.headers['content-type'],
    'x-line-signature': req.headers['x-line-signature'] ? '[present]' : '[missing]',
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
  } catch (err) {
    // ถ้ามี exception ก่อนส่ง 200
    console.error('[WEBHOOK] fatal error:', err);
    // พยายามตอบข้อความธรรมดาแทน 500 (บางระบบจะดีบักง่ายกว่า)
    try {
      return res.status(200).send('ok');
    } catch {
      return; // เงียบไว้
    }
  }
});

function getUserId(ev) {
  return ev?.source?.userId || null;
}

function isSuperAdminUser(userId) {
  return userId ? SUPER_ADMIN_LINE_IDS.has(userId) : false;
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
    return replyQuickMenu(ev.replyToken, 'พิมพ์ "เมนู" เพื่อเริ่มต้น', [
      { label: 'เมนู', text: 'เมนู' },
    ]);
  }
}

async function handlePostbackEvent(ev) {
  const data = ev.postback?.data || '';
  const [action, query = ''] = data.split('?');
  const params = new URLSearchParams(query);

  if (action === 'po-status') {
    const userId = getUserId(ev);
    if (!isSuperAdminUser(userId)) {
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
    if (step === 'start') {
      return replyPoDraftInstructions(ev);
    }
    if (step === 'template') {
      return replyPoDraftTemplate(ev);
    }
  }

  return replyQuickMenu(ev.replyToken, 'พิมพ์ "เมนู" เพื่อเริ่มต้น', [
    { label: 'เมนู', text: 'เมนู' },
  ]);
}

async function handleText(ev) {
  const text = (ev.message?.text || '').trim();
  const userId = getUserId(ev);
  const superAdmin = isSuperAdminUser(userId);

  if (/^ping$/i.test(text) || text === 'เทส') {
    return replyText(ev.replyToken, 'pong');
  }

  if (text === 'เมนู') {
    return replyQuickMenu(ev.replyToken, 'เลือกฟังก์ชันที่ต้องการ', [
      { label: 'สถานะ PO', text: 'สถานะ' },
      { label: 'สรุป วันนี้', text: 'สรุป วันนี้' },
      { label: 'สรุป เมื่อวาน', text: 'สรุป เมื่อวาน' },
      { label: 'สรุป สัปดาห์นี้', text: 'สรุป สัปดาห์นี้' },
      { label: 'สรุป เดือนนี้', text: 'สรุป เดือนนี้' },
      { label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' },
      { label: 'เปิด PR', text: 'เปิดใบขอซื้อ' },
    ]);
  }

  if (/^เช็คของ$/i.test(text) || /check stock/i.test(text)) {
    return replyStockSummary(ev);
  }

  if (/เปิดใบขอซื้อ/i.test(text)) {
    return replyPrLink(ev);
  }

  if (text === 'สถานะ' || text === 'เช็คสถานะ') {
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
    const range = getDateRangeFromKeyword(text);
    if (!range) {
      return replyText(ev.replyToken, 'เช่น "สรุป วันนี้" หรือ "สรุป 10/09/2025"');
    }

    // NOTE: ตัวอย่างนี้อ่านบริษัทจาก ENV ก่อน
    const companyId = process.env.DEFAULT_COMPANY_ID || '';
    if (!companyId) {
      console.warn('[WEBHOOK] DEFAULT_COMPANY_ID is missing in env');
      return replyText(ev.replyToken, 'ยังไม่ได้ตั้งค่า DEFAULT_COMPANY_ID');
    }

    const date = range.dateFrom;
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

  return replyQuickMenu(ev.replyToken, 'พิมพ์ "เมนู" เพื่อเริ่มต้น', [
    { label: 'เมนู', text: 'เมนู' },
    { label: 'สรุป วันนี้', text: 'สรุป วันนี้' },
    { label: 'สถานะ PO', text: 'สถานะ' },
    { label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' },
  ]);
}

async function replyStockSummary(ev) {
  if (!ev.replyToken) return null;
  if (!DEFAULT_COMPANY_ID) {
    return replyText(ev.replyToken, 'ยังไม่ได้ตั้งค่า DEFAULT_COMPANY_ID ในระบบ');
  }

  try {
    const items = await getLowStockItems(DEFAULT_COMPANY_ID, {
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
  const url = `${PORTAL_BASE}/admin/pr`;
  const text = 'คลิกที่ลิงก์ด้านล่างเพื่อเปิดหน้าจัดการใบขอซื้อ (PR):\n' + url;
  return replyText(ev.replyToken, text);
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

async function replyPurchaseOrderStatus(ev, text = '', options = {}) {
  if (!ev.replyToken) return null;
  const userId = getUserId(ev);
  const superAdmin = isSuperAdminUser(userId);

  const poMatch = String(text || '').match(/(PO[-_\d]+)/i);
  const poNumber = options.poNumber || (poMatch ? poMatch[1].toUpperCase() : null);

  try {
    if (poNumber) {
      const po = await getPurchaseOrderByNumber(poNumber);
      if (!po) {
        return replyQuickMenu(ev.replyToken, `ไม่พบใบสั่งซื้อ ${poNumber}`, [
          { label: 'สถานะล่าสุด', text: 'สถานะ' },
          { label: 'เมนู', text: 'เมนู' },
        ]);
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
      targetCompanyId = DEFAULT_COMPANY_ID || null;
    }

    if (!targetCompanyId && !superAdmin) {
      return replyQuickMenu(
        ev.replyToken,
        'ยังไม่ได้ตั้งค่า DEFAULT_COMPANY_ID ในระบบ จึงไม่สามารถดึงใบสั่งซื้อล่าสุดได้',
        [
          { label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' },
          { label: 'เปิด PR', text: 'เปิดใบขอซื้อ' },
          { label: 'เมนู', text: 'เมนู' },
        ]
      );
    }

    let companyDoc = null;
    if (targetCompanyId) {
      try {
        companyDoc = await Company.findById(targetCompanyId).lean();
        if (!companyDoc && superAdmin) {
          return replyQuickMenu(ev.replyToken, 'ไม่พบบริษัทที่เลือก โปรดลองใหม่', [
            { label: 'เลือกบริษัท', postbackData: 'po-status?company=menu', displayText: 'เลือกบริษัทอื่น' },
            { label: 'เมนู', text: 'เมนู' },
          ]);
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
        return replyQuickMenu(ev.replyToken, 'ยังไม่มีใบสั่งซื้อสำหรับบริษัทนี้', [
          { label: 'บริษัทอื่น', postbackData: 'po-status?company=menu', displayText: 'เลือกบริษัทอื่น' },
          { label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' },
          { label: 'เมนู', text: 'เมนู' },
        ]);
      }
      return replyQuickMenu(ev.replyToken, 'ยังไม่มีใบสั่งซื้อในระบบ', [
        { label: 'สร้าง PO', text: 'สร้างใบสั่งซื้อ' },
        { label: 'เมนู', text: 'เมนู' },
      ]);
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
    return replyQuickMenu(ev.replyToken, 'ไม่สามารถตรวจสอบสถานะใบสั่งซื้อได้ กรุณาลองใหม่', [
      { label: 'สถานะล่าสุด', text: 'สถานะ' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
  }
}

async function replyPoCreationFlex(ev) {
  if (!ev.replyToken) return null;

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
    return replyQuickMenu(ev.replyToken, 'ยังไม่มีบริษัทในระบบ', [
      { label: 'เมนู', text: 'เมนู' },
    ]);
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
  if (!isSuperAdminUser(userId)) return false;

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
    await replyQuickMenu(ev.replyToken, 'กรุณาระบุชื่อผู้จัดจำหน่ายจริงก่อนส่ง', [
      { label: 'ดูตัวอย่าง', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
    return true;
  }

  if (!items.length) {
    await replyQuickMenu(ev.replyToken, 'กรุณาระบุผู้จัดจำหน่ายและรายการสินค้าให้ครบถ้วน', [
      { label: 'ดูตัวอย่าง', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
    return true;
  }

  const actor = `line:${userId || 'unknown'}`;

  let company = null;
  if (companyName) {
    if (hasPlaceholder(companyName) || companyName.toLowerCase().includes('ชื่อบริษัท')) {
      await replyQuickMenu(ev.replyToken, 'กรุณาแทนที่ชื่อบริษัทในข้อความก่อนส่ง', [
        { label: 'ดูตัวอย่าง', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
        { label: 'เมนู', text: 'เมนู' },
      ]);
      return true;
    }
    const regex = new RegExp(`^${escapeRegex(companyName)}$`, 'i');
    company = await Company.findOne({ name: regex }).lean();
  }
  if (!company && DEFAULT_COMPANY_ID) {
    company = await Company.findById(DEFAULT_COMPANY_ID).lean();
  }
  if (!company) {
    await replyQuickMenu(ev.replyToken, 'ไม่พบบริษัทที่ระบุ และยังไม่ได้ตั้งค่า DEFAULT_COMPANY_ID', [
      { label: 'เลือกบริษัท', postbackData: 'po-status?company=menu', displayText: 'เลือกบริษัท' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
    return true;
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
    await replyQuickMenu(ev.replyToken, 'สร้างใบสั่งซื้อไม่สำเร็จ กรุณาตรวจสอบข้อมูลอีกครั้ง', [
      { label: 'ดูตัวอย่าง', postbackData: 'po-create?step=template', displayText: 'PO ตัวอย่าง' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
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
