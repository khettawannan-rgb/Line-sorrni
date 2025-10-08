import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';

import Company from '../models/Company.js';
import { getDailySummary, renderTemplateByCode } from './summary.js';
import { pushLineMessage } from './line.js';

dayjs.extend(utc); dayjs.extend(tz);

export function initScheduler() {
  cron.schedule('* * * * *', async () => {
    const companies = await Company.find().lean();
    for (const c of companies) {
      const zone = c.timezone || 'Asia/Bangkok';
      const now = dayjs().tz(zone);
      const hhmm = now.format('HH:mm');
      if (!c.dailySummaryTime || c.dailySummaryTime !== hhmm) continue;

      const today = now.format('YYYY-MM-DD');
      if (global.__lastSent?.[c._id]?.date === today) continue;

      try {
        const summary = await getDailySummary(c._id, today);
        const text = await renderTemplateByCode('daily_summary', {
          date: today, company: c.name,
          totalTrips: summary.totalTrips, totalWeight: summary.totalWeight
        });

        const token = c?.line?.accessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
        const testIds = (process.env.TEST_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
        for (const uid of testIds) await pushLineMessage(uid, text, token);

        global.__lastSent = global.__lastSent || {};
        global.__lastSent[c._id] = { date: today };
        console.log(`[cron] sent summary to ${c.name} ${today}`);
      } catch (e) {
        console.error('[cron] error', e.message);
      }
    }
  }, { timezone: 'Asia/Bangkok' });
}
