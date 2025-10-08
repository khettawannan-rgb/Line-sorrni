// src/jobs/scheduler.js
import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';

import Company from '../models/Company.js';
import Member from '../models/Member.js';
import { buildDailySummary, renderDailySummaryMessage } from '../services/summary.js';
import { pushLineMessage } from '../services/line.js';
import { runAutoReorder } from '../services/procurement/automationService.js';
import { generateSnapshot } from '../services/procurement/stockService.js';

dayjs.extend(utc);
dayjs.extend(tz);

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || null;
const PROCUREMENT_AUTOMATION_ENABLED = String(process.env.ENABLE_PROCUREMENT_AUTOMATION || 'true').toLowerCase() !== 'false';

// helper: หา "เมื่อวาน" ตาม timezone บริษัท
function getYesterdayISO(tzName = 'Asia/Bangkok') {
  return dayjs().tz(tzName).subtract(1, 'day').format('YYYY-MM-DD');
}

// ส่งสรุปให้สมาชิก active ทุกคนของบริษัท
async function sendDailyForCompany(c) {
  const tzName = c.timezone || 'Asia/Bangkok';
  const dateISO = getYesterdayISO(tzName);

  const members = await Member.find({ companyId: c._id, active: true, lineUserId: { $ne: '' } }).lean();
  if (!members.length) {
    console.log('[CRON] skip company (no members):', c.name);
    return;
  }

  const summary = await buildDailySummary(c._id, dateISO);
  const message = renderDailySummaryMessage(summary);

  // ส่งทีละคน (ถ้ากังวล rate limit ค่อย batch ทีหลัง)
  for (const m of members) {
    try {
      await pushLineMessage(m.lineUserId, message);
      console.log('[CRON] sent ->', c.name, m.displayName || m.lineUserId, dateISO);
    } catch (err) {
      console.error('[CRON][SEND ERR]', c.name, m.lineUserId, err?.response?.data || err.message);
    }
  }
}

// สั่งรันทั้งหมด
export async function runDailyAllCompanies() {
  const companies = await Company.find().lean();
  for (const c of companies) {
    try {
      await sendDailyForCompany(c);
    } catch (err) {
      console.error('[CRON][COMPANY ERR]', c?.name || c?._id, err);
    }
  }
}

// สร้าง schedule ตาม dailyTime ของแต่ละบริษัท (ถ้าไม่มี ใช้ 09:00)
export function setupDailyCron() {
  // รันทุก ๆ นาที เช็คว่ามีบริษัทไหนถึงเวลา (กันเรื่อง time zone/เวลาต่างกันต่อบริษัท)
  cron.schedule('* * * * *', async () => {
    try {
      const nowUTC = dayjs.utc();
      const companies = await Company.find().lean();
      for (const c of companies) {
        const tzName = c.timezone || 'Asia/Bangkok';
        const hhmm = (c.dailyTime || '09:00').slice(0,5);
        const [hh, mm] = hhmm.split(':').map(n => Number(n));
        const nowLocal = nowUTC.tz(tzName);

        // ถ้า "นาทีนี้" ตรงกับเวลาที่ตั้ง → ยิง (กันยิงซ้ำด้วยการจำ lastRun ในหน่วยวัน)
        const shouldRun = (nowLocal.hour() === hh && nowLocal.minute() === mm);
        if (!shouldRun) continue;

        // ป้องกันยิงซ้ำในนาทีเดียว ใช้ตัวแปร process global ชั่วคราว
        const key = `${c._id.toString()}@${nowLocal.format('YYYY-MM-DD@HH:mm')}`;
        if (global.__DAILY_RUN_KEYS?.has(key)) continue;
        global.__DAILY_RUN_KEYS = global.__DAILY_RUN_KEYS || new Set();
        global.__DAILY_RUN_KEYS.add(key);

        console.log('[CRON] time reached for:', c.name, tzName, hhmm);
        await sendDailyForCompany(c);
      }
    } catch (err) {
      console.error('[CRON][LOOP ERR]', err);
    }
  });

  if (PROCUREMENT_AUTOMATION_ENABLED && DEFAULT_COMPANY_ID) {
    cron.schedule('*/30 * * * *', async () => {
      try {
        const created = await runAutoReorder(DEFAULT_COMPANY_ID, 'scheduler');
        if (created.length) {
          console.log('[PROCUREMENT][AUTO PR]', `created ${created.length} PRs from low stock monitor`);
        }
      } catch (err) {
        console.error('[PROCUREMENT][AUTO PR] failed:', err.message || err);
      }
    });

    cron.schedule('15 6 * * *', async () => {
      try {
        await generateSnapshot(DEFAULT_COMPANY_ID, {
          safetyStockDays: Number(process.env.PROCUREMENT_SAFETY_DAYS || 3),
        });
        console.log('[PROCUREMENT] snapshot generated for company', DEFAULT_COMPANY_ID);
      } catch (err) {
        console.error('[PROCUREMENT] snapshot failed:', err.message || err);
      }
    });
  }

  console.log('[CRON] daily scheduler started');
}
