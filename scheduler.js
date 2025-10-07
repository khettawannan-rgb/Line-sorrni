// src/jobs/scheduler.js
import cron from 'node-cron';
import dayjs from 'dayjs';
import Company from '../models/Company.js';
import { getDailySummary, formatDailyReport, renderTemplateByCode } from '../services/summary.js';
import { pushLineMessage } from '../services/line.js';

const tasks = new Map(); // companyId -> cron task

function parseHHmm(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return { h: 18, m: 0 };
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return { h, m: mm };
}

async function sendDailyForCompany(company, dateISO) {
  const bizDate = dateISO || dayjs().format('YYYY-MM-DD');
  const summary = await getDailySummary(company._id, bizDate);

  // ใช้ template "daily_summary" ถ้ามี ไม่งั้นใช้ pretty
  const buyWeight  = (summary.buyByProduct  || []).reduce((s,x)=>s+Number(x.weight||0),0);
  const sellWeight = (summary.sellByProduct || []).reduce((s,x)=>s+Number(x.weight||0),0);

  // เตรียมข้อความแบบ template ตัวแปร
  const fmt = (n) => {
    const v = Math.round((Number(n || 0)) * 100) / 100;
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
  };
  const buyLines  = (summary.buyByProduct  || []).sort((a,b)=>b.weight-a.weight).map(p => `• ${p.product} : ${fmt(p.weight)} ตัน`).join('\n') || '• (ไม่มีรายการ)';
  const sellLines = (summary.sellByProduct || []).sort((a,b)=>b.weight-a.weight).map(p => `• ${p.product} : ${fmt(p.weight)} ตัน`).join('\n') || '• (ไม่มีรายการ)';
  const jobLines  = (summary.sellByJob     || []).sort((a,b)=>b.weight-a.weight).map(j => `• ${j.jobName || '(ไม่ระบุชื่อ)'}${j.jobCode ? ' ('+j.jobCode+')' : ''} : ${fmt(j.weight)} ตัน`).join('\n') || '• (ไม่มีรายการ)';

  const vars = {
    date: bizDate,
    company: company.name,
    totalTrips: summary.totalTrips,
    totalWeight: summary.totalWeight,
    buyLines, sellLines, jobLines,
    buyTotal: fmt(buyWeight),
    sellTotal: fmt(sellWeight),
  };

  let text;
  try {
    text = await renderTemplateByCode('daily_summary', vars);
  } catch {
    // fallback เป็น pretty
    text = [
      `ทดสอบบอทรายงานประจำวัน`,
      `📌 รายงานประจำวัน ${bizDate}`,
      ``,
      `📥 ขาเข้า (วัตถุดิบ)`,
      `${buyLines}`,
      `รวมขาเข้า : ${fmt(buyWeight)} ตัน`,
      ``,
      `📤 ขาออก`,
      `${sellLines}`,
      `รวมขาออก : ${fmt(sellWeight)} ตัน`,
      ``,
      `➡️ โครงการ`,
      `${jobLines}`,
    ].join('\n');
  }

  const token = company?.line?.accessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const rawRecipients = (company.recipients && company.recipients.length) ? company.recipients
    : (process.env.TEST_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!rawRecipients || rawRecipients.length === 0) {
    console.warn(`[Scheduler] Company ${company.name} ไม่มี recipients (ลองใส่ใน Companies หรือ TEST_USER_IDS)`);
    return { ok: false, reason: 'no recipients' };
  }

  for (const uid of rawRecipients) {
    await pushLineMessage(uid, text, token);
  }
  return { ok: true, sent: rawRecipients.length };
}

function scheduleOne(company) {
  const { h, m } = parseHHmm(company.dailyTime || '18:00');

  // cron format: m h * * *  + tz
  const expr = `${m} ${h} * * *`;
  try {
    const task = cron.schedule(expr, async () => {
      try {
        await sendDailyForCompany(company);
        console.log(`[Scheduler] Sent daily to "${company.name}" at ${company.dailyTime} (${company.timezone || 'Asia/Bangkok'})`);
      } catch (e) {
        console.error('[Scheduler] sendDailyForCompany error:', e?.message || e);
      }
    }, {
      timezone: company.timezone || 'Asia/Bangkok'
    });

    tasks.set(String(company._id), task);
    console.log(`[Scheduler] Scheduled ${company.name} at ${company.dailyTime} [${company.timezone || 'Asia/Bangkok'}]`);
  } catch (e) {
    console.error(`[Scheduler] Failed to schedule ${company.name}:`, e?.message || e);
  }
}

export async function startScheduler() {
  await reloadSchedules();
}

export async function reloadSchedules() {
  // stop all
  for (const [, t] of tasks) try { t.stop(); } catch {}
  tasks.clear();

  const companies = await Company.find().lean();
  companies.forEach(scheduleOne);
}

export async function triggerSendDaily(companyId, dateISO) {
  const c = await Company.findById(companyId).lean();
  if (!c) throw new Error('Company not found');
  return sendDailyForCompany(c, dateISO);
}
