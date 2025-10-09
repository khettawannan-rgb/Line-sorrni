// src/services/line.js
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const DEBUG = process.env.LINE_DEBUG === '1';

// LINE endpoints
const BASE_API = 'https://api.line.me';          // สำหรับทุกอย่างยกเว้น content
const BASE_DATA = 'https://api-data.line.me';    // สำหรับอัปโหลด/ดาวน์โหลด content (เช่น rich menu image)

// --- axios instances ---
const api = axios.create({
  baseURL: BASE_API,
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
});

const data = axios.create({
  baseURL: BASE_DATA,
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
});

// --- interceptors & logging ---
function attachInterceptors(instance, tag) {
  instance.interceptors.response.use(
    (res) => {
      if (DEBUG) {
        const m = (res.config?.method || 'get').toUpperCase();
        const u = res.config?.url || '';
        console.log(`[LINE OK][${tag}] ${m} ${instance.defaults.baseURL}${u} -> ${res.status}`);
      }
      return res;
    },
    (err) => {
      const m = (err?.config?.method || 'GET').toUpperCase();
      const u = err?.config?.url || '';
      const st = err?.response?.status;
      const body = err?.response?.data;
      console.error(`[LINE ERR][${tag}] ${m} ${instance.defaults.baseURL}${u} -> ${st}`, body || err.message);
      return Promise.reject(err);
    }
  );
}
attachInterceptors(api, 'api');
attachInterceptors(data, 'data');

if (!ACCESS_TOKEN) {
  console.warn('[LINE] LINE_CHANNEL_ACCESS_TOKEN is empty (DEV mode: skip real API calls).');
}

// ---------- Helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_IMAGE_BYTES = Number(process.env.LINE_RICHMENU_IMAGE_MAX || 1024 * 1024); // default 1MB

// ---------- Messaging ----------
export async function replyText(replyToken, text) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] replyText ->', text);
    return;
  }
  const payload = {
    replyToken,
    messages: [{ type: 'text', text: String(text ?? '') }],
  };
  await api.post('/v2/bot/message/reply', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function replyQuickMenu(replyToken, text, items = []) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] replyQuickMenu ->', text, items);
    return;
  }
  const quickItems = (items || []).map((it) => {
    const label = it.label || it.text || 'เลือก';
    if (it.postbackData) {
      return {
        type: 'action',
        action: {
          type: 'postback',
          label,
          data: it.postbackData,
          displayText: it.displayText || it.text || label,
        },
      };
    }
    return {
      type: 'action',
      action: { type: 'message', label, text: it.text ?? label },
    };
  });
  const payload = {
    replyToken,
    messages: [{
      type: 'text',
      text: text || '',
      quickReply: { items: quickItems },
    }],
  };
  await api.post('/v2/bot/message/reply', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function replyFlex(replyToken, altText, contents, additionalMessages = []) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] replyFlex ->', altText, contents, additionalMessages);
    return;
  }
  const extra = Array.isArray(additionalMessages) ? additionalMessages : [additionalMessages];
  const payload = {
    replyToken,
    messages: [
      {
        type: 'flex',
        altText: (altText || 'ข้อความจากบอท').slice(0, 399),
        contents,
      },
      ...extra,
    ],
  };
  await api.post('/v2/bot/message/reply', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function pushLineMessage(to, messageOrMessages) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] pushLineMessage ->', to, messageOrMessages);
    return { ok: true, dev: true };
  }
  const messages = Array.isArray(messageOrMessages)
    ? messageOrMessages
    : [{ type: 'text', text: String(messageOrMessages ?? '') }];

  const payload = { to: String(to || ''), messages };
  const res = await api.post('/v2/bot/message/push', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  return { ok: res.status >= 200 && res.status < 300 };
}

/** NEW: ดึงโปรไฟล์ผู้ใช้จาก LINE */
export async function getUserProfile(userId) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] getUserProfile ->', userId);
    return { displayName: '(DEV) User', pictureUrl: '', statusMessage: '' };
  }
  const res = await api.get(`/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  // { userId, displayName, pictureUrl, statusMessage }
  return res.data || {};
}

// ---------- Rich Menu ----------
export async function createRichMenu(menuConfig) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] createRichMenu ->', menuConfig);
    return 'DEV_RICHMENU_ID';
  }
  const res = await api.post('/v2/bot/richmenu', menuConfig, {
    headers: { 'Content-Type': 'application/json' },
  });
  return res.data?.richMenuId;
}

export async function getRichMenu(richMenuId) {
  if (!ACCESS_TOKEN) return { dev: true };
  const res = await api.get(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`);
  return res.data || null;
}

/** อัปโหลดรูป PNG ไปยัง richMenuId (ใช้ api-data) + ขนาดต้องไม่เกิน MAX_IMAGE_BYTES */
export async function uploadRichMenuImage(richMenuId, imagePathOrBuffer) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] uploadRichMenuImage ->', richMenuId, imagePathOrBuffer);
    return true;
  }

  // 0) ตรวจสอบเมนูมีจริง
  await getRichMenu(richMenuId);

  // 1) เตรียม buffer และเช็คขนาด
  let buf;
  let contentType = 'image/png';
  if (Buffer.isBuffer(imagePathOrBuffer)) {
    buf = imagePathOrBuffer;
  } else if (typeof imagePathOrBuffer === 'string') {
    buf = fs.readFileSync(imagePathOrBuffer);
    try {
      const st = fs.statSync(imagePathOrBuffer);
      console.log(`[RICHMENU] using image ${imagePathOrBuffer} (${st.size} bytes)`);
    } catch {}
    const ext = path.extname(imagePathOrBuffer).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  } else {
    throw new Error('imagePathOrBuffer must be Buffer or file path');
  }

  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Rich menu image too large: ${buf.length} bytes (limit ${MAX_IMAGE_BYTES}). ` +
      `โปรดบีบอัด/ลดขนาดรูปให้ ≤ ${(MAX_IMAGE_BYTES/1024/1024).toFixed(2)}MB`
    );
  }

  // 2) อัปโหลด (api-data)
  const doUpload = () =>
    data.post(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buf.length,
      },
      maxBodyLength: Infinity,
      transformRequest: [(b) => b], // ส่ง buffer ตรง ๆ
    });

  // 3) retry สำหรับเคส 404/409 ชั่วคราว
  const delays = [400, 800, 1500];
  for (let i = 0; i <= delays.length; i++) {
    try {
      await doUpload();
      if (DEBUG) console.log(`[RICHMENU] upload OK on attempt ${i + 1}`);
      return true;
    } catch (e) {
      const st = e?.response?.status;
      const retriable = st === 404 || st === 409 || st === 429 || st >= 500;
      if (retriable && i < delays.length) {
        const wait = delays[i];
        if (DEBUG) console.log(`[RICHMENU] upload got ${st}, retry in ${wait}ms (attempt ${i + 1})`);
        await sleep(wait);
        continue;
      }
      // 413 = รูปใหญ่เกิน
      if (st === 413) {
        throw new Error('Upload failed: 413 Request Entity Too Large — โปรดลดขนาดรูป (≤ 1MB โดยค่าเริ่มต้น)');
      }
      throw e;
    }
  }
  return true;
}

/** ตรวจว่ามีภาพแล้วหรือยัง (api-data) */
export async function checkRichMenuImageExists(richMenuId) {
  if (!ACCESS_TOKEN) return true;
  try {
    const res = await data.get(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
      responseType: 'arraybuffer',
    });
    return res.status === 200 && !!res.data;
  } catch (e) {
    if (e?.response?.status === 404) return false;
    throw e;
  }
}

/** ตั้งค่า default ให้ user ทั้งหมด (ต้องอัปโหลดรูปสำเร็จก่อน) */
export async function setDefaultRichMenu(richMenuId) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] setDefaultRichMenu ->', richMenuId);
    return true;
  }
  await api.post(`/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`);
  return true;
}

export async function linkRichMenuToUser(userId, richMenuId) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] linkRichMenuToUser ->', userId, richMenuId);
    return true;
  }
  await api.post(`/v2/bot/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`);
  return true;
}

export async function unlinkRichMenuFromUser(userId) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] unlinkRichMenuFromUser ->', userId);
    return true;
  }
  await api.delete(`/v2/bot/user/${encodeURIComponent(userId)}/richmenu`);
  return true;
}

export async function getRichMenuList() {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] getRichMenuList');
    return [];
  }
  const res = await api.get('/v2/bot/richmenu/list');
  return res.data?.richmenus || [];
}

export async function deleteRichMenu(richMenuId) {
  if (!ACCESS_TOKEN) {
    console.log('[LINE DEV] deleteRichMenu ->', richMenuId);
    return true;
  }
  await api.delete(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`);
  return true;
}

// ---------- Bot info ----------
export async function getBotInfo() {
  if (!ACCESS_TOKEN) return { dev: true };
  const res = await api.get('/v2/bot/info');
  return res.data;
}
