// project-root/src/routes/mockDailySummary.js
import { Router } from 'express';
import { DAILY_REPORTS } from '../services/dailySummary.js';
import { summarizeDaily } from '../services/dailySummary.js';
import { buildDailySummaryFlex } from '../flex/dailySummary.js';
import { pushLineMessage } from '../services/line.js';
import { track } from '../lib/cdp.js';
import { nextReportIndex, resetReportIndex, getReportIndex } from '../mock/state.js';

const router = Router();

function currentReport() {
  const idx = getReportIndex();
  const data = DAILY_REPORTS[idx % DAILY_REPORTS.length];
  const summary = summarizeDaily(data);
  const flex = buildDailySummaryFlex(summary);
  return { idx, summary, flex, date: data.date, siteCount: data.sites.length };
}

router.get(['/mock/preview-daily-summary', '/admin/ai/mock/daily/preview'], (req, res) => {
  const payload = currentReport();
  track('preview_daily_summary_mock', { index: payload.idx, date: payload.date, sites: payload.siteCount, pos: payload.summary.pos_sites, neg: payload.summary.neg_sites });
  res.json({ ok: true, index: payload.idx, summary: payload.summary, flex: payload.flex });
});

router.post(['/mock/send-daily-summary', '/admin/ai/mock/daily/send'], async (req, res) => {
  const useIndex = nextReportIndex(DAILY_REPORTS.length); // rotate
  const data = DAILY_REPORTS[useIndex];
  const summary = summarizeDaily(data);
  const flex = buildDailySummaryFlex(summary);
  const to = process.env.DAILY_SUMMARY_TO || process.env.AI_TEST_RECIPIENT || process.env.SUPER_ADMIN_LINE_USER_ID || '';
  if (!to) return res.status(400).json({ ok: false, error: 'missing recipient env DAILY_SUMMARY_TO/AI_TEST_RECIPIENT' });
  try {
    await pushLineMessage(to, [flex]);
    track('push_daily_summary_mock', { index: useIndex, date: data.date, sites: data.sites.length, pos: summary.pos_sites, neg: summary.neg_sites, to });
    res.json({ ok: true, sent: true, index: useIndex, next: getReportIndex() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'push failed' });
  }
});

router.post(['/mock/reset-rotation', '/admin/ai/mock/daily/reset'], (req, res) => {
  resetReportIndex();
  res.json({ ok: true, index: 0 });
});

export default router;
