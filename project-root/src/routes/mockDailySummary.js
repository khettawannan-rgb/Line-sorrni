// project-root/src/routes/mockDailySummary.js
import { Router } from 'express';
import { DAILY_REPORTS } from '../services/dailySummary.js';
import { summarizeDaily } from '../services/dailySummary.js';
import { buildDailySummaryFlex } from '../flex/dailySummary.js';
import { pushLineMessage } from '../services/line.js';
import { track } from '../lib/cdp.js';
import { nextReportIndex, resetReportIndex, getReportIndex } from '../mock/state.js';
import AudienceGroup from '../models/audienceGroup.model.js';
import LineConsent from '../models/lineConsent.model.js';
import { loadImagePool, chooseImagesForSummary } from '../services/reportImages.js';

const router = Router();

function currentReport(req) {
  const idx = getReportIndex();
  const data = DAILY_REPORTS[idx % DAILY_REPORTS.length];
  const summary = summarizeDaily(data);
  const pool = loadImagePool();
  const baseUrl = process.env.BASE_URL || (req ? `${(req.get('x-forwarded-proto') || req.protocol || 'https')}://${req.get('host')}` : '');
  const picks = chooseImagesForSummary(summary, pool, { baseUrl, perOverview: 3, perSite: 2 });
  const flex = buildDailySummaryFlex(summary, { overviewImages: picks.overviewImages, siteImages: picks.siteImages });
  return { idx, summary, flex, date: data.date, siteCount: data.sites.length };
}

router.get(['/mock/preview-daily-summary', '/admin/ai/mock/daily/preview'], (req, res) => {
  const payload = currentReport(req);
  track('preview_daily_summary_mock', { index: payload.idx, date: payload.date, sites: payload.siteCount, pos: payload.summary.pos_sites, neg: payload.summary.neg_sites });
  res.json({ ok: true, index: payload.idx, summary: payload.summary, flex: payload.flex });
});

router.post(['/mock/send-daily-summary', '/admin/ai/mock/daily/send'], async (req, res) => {
  const useIndex = nextReportIndex(DAILY_REPORTS.length); // rotate
  const data = DAILY_REPORTS[useIndex];
  const summary = summarizeDaily(data);
  const pool = loadImagePool();
  const baseUrl = process.env.BASE_URL || `${(req.get('x-forwarded-proto') || req.protocol || 'https')}://${req.get('host')}`;
  const picks = chooseImagesForSummary(summary, pool, { baseUrl, perOverview: 3, perSite: 2 });
  const flex = buildDailySummaryFlex(summary, { overviewImages: picks.overviewImages, siteImages: picks.siteImages });
  const bodyTo = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
  const groupId = String(req.body.groupId || '').trim();
  const toAll = String(req.body.toAll || '').toLowerCase() === '1' || String(req.body.toAll || '').toLowerCase() === 'true';
  let recipients = [];
  if (groupId) {
    const g = await AudienceGroup.findById(groupId).lean();
    recipients = (g?.userIds || []).filter(Boolean);
  } else if (toAll) {
    recipients = (await LineConsent.find({ status: 'granted' }).select('userId').lean()).map((r) => r.userId);
  } else if (bodyTo) {
    recipients = [bodyTo];
  } else {
    return res.redirect(303, '/admin/ai');
  }
  try {
    for (const uid of recipients) {
      await pushLineMessage(uid, [flex]);
      track('push_daily_summary_mock', { index: useIndex, date: data.date, sites: data.sites.length, pos: summary.pos_sites, neg: summary.neg_sites, to: uid });
    }
    return res.redirect(303, '/admin/ai');
  } catch (err) {
    return res.redirect(303, '/admin/ai');
  }
});

router.post(['/mock/reset-rotation', '/admin/ai/mock/daily/reset'], (req, res) => {
  resetReportIndex();
  res.json({ ok: true, index: 0 });
});

export default router;
