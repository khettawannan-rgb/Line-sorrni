// project-root/src/routes/ai.js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { loadMock, saveMock, appendChatLog, loadChatLog, getDefaultMock } from '../services/ai/mockStore.js';
import { seedMockWeather, seedMockMaterials } from '../services/ai/mockSeeders.js';
import { buildWeatherFlex, analyzeWeatherSlots, generateDailySummary, buildDailySummaryFlex, buildTasksFlex, buildChatText, buildChatTranscriptFlex, buildCdpText } from '../services/ai/advisor.js';
import { DAILY_REPORTS, summarizeDaily } from '../services/dailySummary.js';
import { getReportIndex } from '../mock/state.js';
import { pushLineMessage } from '../services/line.js';

const router = express.Router();
// Allow sending when a recipient is explicitly provided, regardless of AI_MOCK_ONLY
// This keeps the lab "mock" by default, but enables manual test sends when 'to' is filled.
const AI_MOCK_ONLY = String(process.env.AI_MOCK_ONLY || 'true').toLowerCase() === 'true';
const DEFAULT_RECIPIENT = process.env.AI_TEST_RECIPIENT || process.env.SUPER_ADMIN_LINE_USER_ID || '';
const EXTENDED_TABLES = String(process.env.USE_EXTENDED_MOCK_TABLES || '').toLowerCase() === 'true';

function asNumber(val, d = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : d;
}

router.get('/admin/ai', (req, res) => {
  const mock = loadMock();
  const chatLog = loadChatLog(20);
  // Augment mock for view when flag is off (display-only; store ไม่เปลี่ยน)
  let viewMock = mock;
  let extendedView = EXTENDED_TABLES;
  if (!EXTENDED_TABLES) {
    const hours = Array.isArray(mock.weather)
      ? mock.weather.map((w) => {
          const hh = String(w.time || '0').slice(0, 2);
          const n = Number(hh);
          return Number.isFinite(n) ? n : 0;
        })
      : [6, 9, 12, 15, 18, 21];
    const enrichedWeather = seedMockWeather({ seed: Date.now() % 1000000, hours }).map((row, idx) => ({
      ...mock.weather?.[idx],
      ...row,
    }));
    const count = Array.isArray(mock.materials) ? mock.materials.length : 6;
    const enrichedMaterialsSeed = seedMockMaterials({ seed: (Date.now() + 12345) % 1000000, count });
    const enrichedMaterials = (mock.materials || []).map((m, idx) => ({ ...m, ...enrichedMaterialsSeed[idx % enrichedMaterialsSeed.length] }));
    viewMock = { ...mock, weather: enrichedWeather, materials: enrichedMaterials };
    extendedView = true;
  }

  const lastWeather = viewMock.weather?.[0] || null;
  const { worst, advice } = analyzeWeatherSlots(viewMock.weather);
  // Daily summary mock preview (current index)
  const dsIndex = getReportIndex() % DAILY_REPORTS.length;
  const dsSummary = summarizeDaily(DAILY_REPORTS[dsIndex]);
  const dsFlex = buildDailySummaryFlex(dsSummary);

  res.render('ai/index', {
    title: 'AI Assistant (Mock)',
    active: 'ai',
    extendedTables: extendedView,
    mock: viewMock,
    chatLog,
    preview: {
      worst,
      advice,
      weatherFlex: buildWeatherFlex({
        dateLabel: new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' }),
        locationName: viewMock.location?.name,
        status: lastWeather?.condition || 'ไม่ทราบ',
        temp: lastWeather ? `${lastWeather.tempC}°C` : null,
        advice,
        detailsUrl: '#',
      }),
      summaryText: generateDailySummary(viewMock),
      summaryFlex: buildDailySummaryFlex(viewMock),
      dailyFlex: dsFlex,
      dailyIndex: dsIndex,
      dailyTotal: DAILY_REPORTS.length,
      tasksFlex: buildTasksFlex(viewMock.tasks || []),
      chatText: buildChatText(viewMock.chatSamples || []),
      chatFlex: buildChatTranscriptFlex(viewMock.chatSamples || []),
      cdpText: buildCdpText(viewMock.cdp || {}),
    },
  });
});

router.post('/admin/ai/mock/weather', (req, res) => {
  const mock = loadMock();
  const { condition, tempC, humidity, rainProb, time } = req.body || {};
  const slot = {
    time: String(time || '08:00'),
    condition: String(condition || 'เมฆเป็นส่วนมาก'),
    tempC: asNumber(tempC, 30),
    humidity: asNumber(humidity, 70),
    rainProb: asNumber(rainProb, 20),
  };
  if (EXTENDED_TABLES) {
    // enrich automatically with extended mock fields
    slot.wind_speed = Math.max(0, Math.min(30, Math.round(Math.random() * 30)));
    slot.uv_index = Math.max(0, Math.min(11, Math.round(Math.random() * 11)));
    const feels = Number(slot.tempC) + (2 + Math.round(Math.random() * 3));
    slot.feels_like = feels;
    const rainRatio = Math.max(0, Math.min(1, Number(slot.rainProb || 0) / 100));
    slot.rainfall_mm = Math.round(rainRatio * (2 + Math.random() * 18));
    slot.visibility = Math.max(2, 12 - Math.round(rainRatio * 8) - Math.round(Math.random() * 2));
    slot.pressure = 1000 + Math.round((1 - rainRatio) * 10) + Math.round(Math.random() * 2) - 5;
    slot.cloud_cover = Math.min(100, Math.round(rainRatio * 70 + (slot.uv_index < 4 ? 30 : 10)));
    slot.dew_point = Math.round(slot.tempC - ((100 - slot.humidity) / 5));
  }
  const next = { ...mock, weather: [slot, ...(mock.weather || []).slice(0, 9)] };
  saveMock(next);
  appendChatLog({ type: 'weather-mock', slot });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/mock/material', (req, res) => {
  const mock = loadMock();
  const item = {
    name: String(req.body.name || 'วัสดุใหม่'),
    code: String(req.body.code || 'MAT'),
    stockTons: asNumber(req.body.stockTons, 0),
    moisture: req.body.moisture ? asNumber(req.body.moisture, 0) : undefined,
  };
  if (EXTENDED_TABLES) {
    item.batch_no = `BATCH-${Math.floor(10000 + Math.random() * 90000)}`;
    item.last_updated = new Date().toISOString();
    item.quality_grade = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
    item.supplier = ['Supplier A', 'Supplier B', 'Supplier C'][Math.floor(Math.random() * 3)];
    item.storage = Math.random() < 0.5 ? 'indoor' : 'outdoor';
    item.days_left = Math.floor(3 + Math.random() * 28);
    item.unit_cost = Math.floor(600 + Math.random() * 1200);
    item.total_value = Math.round((item.stockTons || 0) * (item.unit_cost || 0));
    item.next_delivery = new Date(Date.now() + (1 + Math.floor(Math.random() * 14)) * 86400000).toISOString().slice(0, 10);
  }
  const next = { ...mock, materials: [item, ...(mock.materials || [])].slice(0, 10) };
  saveMock(next);
  appendChatLog({ type: 'material-mock', item });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/mock/reset', (req, res) => {
  let next = getDefaultMock();
  if (EXTENDED_TABLES) {
    // regenerate with seeders to ensure extended fields exist
    next = {
      ...next,
      weather: seedMockWeather({ seed: 111222 }),
      materials: seedMockMaterials({ seed: 333444 }),
    };
  }
  saveMock(next);
  appendChatLog({ type: 'reset' });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/mock/load-demo', (req, res) => {
  try {
    const demoPath = path.resolve('storage/demo_ai_mock.json');
    if (!fs.existsSync(demoPath)) return res.status(404).send('Demo file not found');
    const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
    // Map demo -> mock store shape
    const ds = Array.isArray(demo.daily_summary) ? demo.daily_summary[0] : null;
    let weather = Array.isArray(demo.weather_advisory) ? demo.weather_advisory.map((w) => ({
      time: String(w.time || ''),
      condition: String(w.condition || ''),
      tempC: Number(w.temp_c ?? 0),
      humidity: Number(w.humidity ?? 70),
      rainProb: Number(w.rain_prob_pct ?? 0),
    })) : [];
    let materials = Array.isArray(ds?.materials_used) ? ds.materials_used.map((m) => ({
      name: m.name, code: m.code, stockTons: Number(m.qty_tons || 0), moisture: m.moisture_pct != null ? Number(m.moisture_pct) : undefined,
    })) : [];
    if (EXTENDED_TABLES) {
      // augment with extended fields deterministically
      const seededWeather = seedMockWeather({ seed: 555666, hours: weather.length ? weather.map((w) => Number(String(w.time).slice(0,2))) : undefined });
      weather = weather.map((row, idx) => ({ ...row, ...seededWeather[idx % seededWeather.length] }));
      const seededMaterials = seedMockMaterials({ seed: 777888, count: materials.length || 6 });
      materials = materials.map((row, idx) => ({ ...row, ...seededMaterials[idx % seededMaterials.length] }));
    }
    const teamNames = new Set((ds?.shifts || []).map((s) => s.team).filter(Boolean));
    const team = [...teamNames].map((name) => ({ name }));
    const location = ds?.site ? { name: ds.site.name, lat: ds.site.lat, lng: ds.site.lng } : undefined;
    const tasks = Array.isArray(demo.task_recommendation) ? demo.task_recommendation.map((t) => ({
      type: t.type || 'generic',
      priority: t.priority || 'low',
      message: t.message,
      reason: t.reason,
      suggest: t.suggested_action,
    })) : [];
    const cdp = demo.cdp_dashboard || {};
    const chatSamples = Array.isArray(demo.chat_interaction) ? demo.chat_interaction.map((c) => ({ time: c.time, from: c.from, message: c.message })) : [];
    const next = saveMock({ weather, materials, team, location, tasks, cdp, chatSamples });
    // seed chat log
    if (Array.isArray(demo.chat_interaction)) {
      demo.chat_interaction.forEach((item) => appendChatLog({ type: 'preload-chat', item }));
    }
    appendChatLog({ type: 'load-demo', counts: { weather: weather.length, materials: materials.length, team: team.length } });
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'load-demo-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to load demo');
  }
});

router.post('/admin/ai/send/summary', async (req, res) => {
  const mock = loadMock();
  const summary = generateDailySummary(mock);
  const flex = buildDailySummaryFlex(mock);
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  // If a destination is provided, allow actual send; otherwise stay in dry-run
  const dryRun = !to;
  appendChatLog({ type: 'send-summary', to: to || '(none)', dryRun, text: summary, flex });
  try {
    if (!dryRun) await pushLineMessage(to, [flex]);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-summary-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

router.post('/admin/ai/send/weather', async (req, res) => {
  const mock = loadMock();
  const { worst, advice } = analyzeWeatherSlots(mock.weather);
  const flex = buildWeatherFlex({
    locationName: mock.location?.name,
    status: worst?.condition || 'ไม่ทราบ',
    temp: worst ? `${worst.tempC}°C` : null,
    advice,
  });
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = !to;
  appendChatLog({ type: 'send-weather', to: to || '(none)', dryRun, flex });
  try {
    if (!dryRun) await pushLineMessage(to, [flex]);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-weather-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

router.post('/admin/ai/send/tasks', async (req, res) => {
  const mock = loadMock();
  const flex = buildTasksFlex(mock.tasks || []);
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = !to;
  appendChatLog({ type: 'send-tasks', to: to || '(none)', dryRun, flex });
  try {
    if (!dryRun) await pushLineMessage(to, [flex]);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-tasks-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

router.post('/admin/ai/send/chat', async (req, res) => {
  const mock = loadMock();
  const text = buildChatText(mock.chatSamples || []);
  const flex = buildChatTranscriptFlex(mock.chatSamples || []);
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = !to;
  appendChatLog({ type: 'send-chat-transcript', to: to || '(none)', dryRun, text });
  try {
    if (!dryRun) await pushLineMessage(to, [flex]);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-chat-transcript-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

router.post('/admin/ai/send/cdp', async (req, res) => {
  const mock = loadMock();
  const text = buildCdpText(mock.cdp || {});
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = !to;
  appendChatLog({ type: 'send-cdp-digest', to: to || '(none)', dryRun, text });
  try {
    if (!dryRun) await pushLineMessage(to, [{ type: 'text', text }]);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-cdp-digest-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

export default router;
