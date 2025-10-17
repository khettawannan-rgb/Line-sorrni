// project-root/src/services/ai/mockStore.js
import fs from 'node:fs';
import path from 'node:path';
import { seedMockWeather, seedMockMaterials } from './mockSeeders.js';

const STORAGE_DIR = path.resolve('storage');
const STORE_FILE = path.join(STORAGE_DIR, 'ai_mock.json');
const CHAT_LOG_FILE = path.join(STORAGE_DIR, 'ai_chat_log.json');

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export function loadMock() {
  try {
    ensureStorage();
    if (!fs.existsSync(STORE_FILE)) return getDefaultMock();
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { ...getDefaultMock(), ...data };
  } catch (err) {
    console.warn('[AI MOCK] load error -> using defaults', err?.message || err);
    return getDefaultMock();
  }
}

export function saveMock(nextData) {
  try {
    ensureStorage();
    const data = { ...getDefaultMock(), ...(nextData || {}) };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.error('[AI MOCK] save error', err?.message || err);
    throw err;
  }
}

export function appendChatLog(entry) {
  try {
    ensureStorage();
    const now = new Date().toISOString();
    const item = { time: now, ...entry };
    const list = fs.existsSync(CHAT_LOG_FILE)
      ? JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf8'))
      : [];
    list.push(item);
    fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(list.slice(-500), null, 2));
    return item;
  } catch (err) {
    console.error('[AI MOCK] appendChatLog error', err?.message || err);
    return null;
  }
}

export function loadChatLog(limit = 20) {
  try {
    if (!fs.existsSync(CHAT_LOG_FILE)) return [];
    const list = JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf8')) || [];
    return list.slice(-limit).reverse();
  } catch (err) {
    console.warn('[AI MOCK] loadChatLog error', err?.message || err);
    return [];
  }
}

export function getDefaultMock() {
  const today = new Date();
  const fmt = (d) => d.toLocaleDateString('th-TH', { dateStyle: 'medium' });
  const hours = [17, 18, 19, 20, 21];
  const USE_EXT = String(process.env.USE_EXTENDED_MOCK_TABLES || '').toLowerCase() === 'true';
  const base = {
    meta: { project: 'NILA Construction · Mock', generatedAt: fmt(today) },
    weather: hours.map((h, i) => ({
      time: `${String(h).padStart(2, '0')}:00`,
      condition: i < 2 ? 'ฝนฟ้าคะนอง' : i < 4 ? 'ฝนตกปรอย' : 'เมฆเป็นส่วนมาก',
      tempC: 30 - i,
      humidity: 70 + i * 3,
      rainProb: 80 - i * 10,
    })),
    location: { name: 'ไซต์งานหลัก', lat: 13.7563, lng: 100.5018 },
    materials: [
      { name: 'ยางมะตอย', code: 'ASPHALT', stockTons: 42.5, moisture: 7.5 },
      { name: 'หิน', code: 'AGG', stockTons: 120.2, moisture: 2.1 },
      { name: 'น้ำมันเชื้อเพลิง', code: 'FUEL', stockTons: 3.4 },
    ],
    team: [{ name: 'Site A · Crew 1' }, { name: 'Site B · Crew 2' }],
    tasks: [
      { type: 'stock', priority: 'high', message: 'สัปดาห์นี้ควรสั่งยางมะตอยเพิ่ม', reason: 'คงคลัง 42.5 ตัน vs ใช้เฉลี่ย 60 ตัน/สัปดาห์', suggest: 'ออกใบสั่งซื้อ 30–40 ตัน' },
      { type: 'quality', priority: 'medium', message: 'ตรวจความชื้นวัสดุ', reason: 'ยางชื้น 6.8% เกินเกณฑ์ 6%', suggest: 'อุ่นวัสดุก่อนมิก/ปู' },
    ],
    chatSamples: [
      { time: new Date().toISOString(), from: 'site-foreman', message: { type: 'text', text: 'เริ่มงานช่วงไหนดี?' } },
    ],
    cdp: {
      summary: { dailyActive: 64, weeklyActive: 212, newUsers7d: 17, returning7d: 58, messages7d: 1340 },
      segments: [
        { label: 'Power Users', users: 12 },
        { label: 'Returning', users: 58 },
        { label: 'New', users: 17 },
        { label: 'Dormant 30d', users: 24 },
      ],
      predictive: [
        { type: 'churn-risk', message: 'กลุ่ม Returning มีความเสี่ยงเป็น Dormant เพิ่มขึ้น 12% สัปดาห์นี้' },
        { type: 'campaign', message: 'เสนอแคมเปญต้อนรับสำหรับ New users → เพิ่มการกลับมาใช้ซ้ำ' },
      ],
    },
  };
  if (!USE_EXT) return base;
  // Extend with richer mock rows
  const seed = 987654;
  const weather = seedMockWeather({ seed });
  const materials = seedMockMaterials({ seed });
  return { ...base, weather, materials };
}

export default {
  loadMock,
  saveMock,
  appendChatLog,
  loadChatLog,
  getDefaultMock,
};
