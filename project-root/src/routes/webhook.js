// src/routes/webhook.js
import { Router } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { replyText, replyQuickMenu, pushLineMessage, getUserProfile } from '../services/line.js';
import LineChatLog from '../models/lineChatLog.model.js';
import LineMedia from '../models/lineMedia.model.js';
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

const WEATHER_KEYWORDS = [/อากาศ/i, /weather/i, /ฝนตก/i, /พยากรณ์/i];

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
router.post('/', async (req, res) => {
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

async function handleText(ev) {
  const text = (ev.message?.text || '').trim();

  if (/^ping$/i.test(text) || text === 'เทส') {
    return replyText(ev.replyToken, 'pong');
  }

  if (text === 'เมนู') {
    return replyQuickMenu(ev.replyToken, 'เลือกช่วงสรุปที่ต้องการ', [
      { label: 'สรุป วันนี้', text: 'สรุป วันนี้' },
      { label: 'สรุป เมื่อวาน', text: 'สรุป เมื่อวาน' },
      { label: 'สรุป สัปดาห์นี้', text: 'สรุป สัปดาห์นี้' },
      { label: 'สรุป เดือนนี้', text: 'สรุป เดือนนี้' },
    ]);
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
  ]);
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
