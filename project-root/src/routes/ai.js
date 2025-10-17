// project-root/src/routes/ai.js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { loadMock, saveMock, appendChatLog, loadChatLog, getDefaultMock } from '../services/ai/mockStore.js';
import { buildWeatherFlex, analyzeWeatherSlots, generateDailySummary, buildTasksFlex, buildChatText, buildCdpText } from '../services/ai/advisor.js';
import { pushLineMessage } from '../services/line.js';

const router = express.Router();
const AI_MOCK_ONLY = String(process.env.AI_MOCK_ONLY || 'true').toLowerCase() === 'true';
const DEFAULT_RECIPIENT = process.env.AI_TEST_RECIPIENT || process.env.SUPER_ADMIN_LINE_USER_ID || '';

function asNumber(val, d = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : d;
}

router.get('/admin/ai', (req, res) => {
  const mock = loadMock();
  const chatLog = loadChatLog(20);
  const lastWeather = mock.weather?.[0] || null;
  const { worst, advice } = analyzeWeatherSlots(mock.weather);

  res.render('ai/index', {
    title: 'AI Assistant (Mock)',
    active: 'ai',
    mock,
    chatLog,
    preview: {
      worst,
      advice,
      weatherFlex: buildWeatherFlex({
        dateLabel: new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' }),
        locationName: mock.location?.name,
        status: lastWeather?.condition || 'ไม่ทราบ',
        temp: lastWeather ? `${lastWeather.tempC}°C` : null,
        advice,
        detailsUrl: '#',
      }),
      summaryText: generateDailySummary(mock),
      tasksFlex: buildTasksFlex(mock.tasks || []),
      chatText: buildChatText(mock.chatSamples || []),
      cdpText: buildCdpText(mock.cdp || {}),
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
  const next = { ...mock, materials: [item, ...(mock.materials || [])].slice(0, 10) };
  saveMock(next);
  appendChatLog({ type: 'material-mock', item });
  res.redirect('/admin/ai');
});

router.post('/admin/ai/mock/reset', (req, res) => {
  const next = getDefaultMock();
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
    const weather = Array.isArray(demo.weather_advisory) ? demo.weather_advisory.map((w) => ({
      time: String(w.time || ''),
      condition: String(w.condition || ''),
      tempC: Number(w.temp_c ?? 0),
      humidity: Number(w.humidity ?? 70),
      rainProb: Number(w.rain_prob_pct ?? 0),
    })) : [];
    const materials = Array.isArray(ds?.materials_used) ? ds.materials_used.map((m) => ({
      name: m.name, code: m.code, stockTons: Number(m.qty_tons || 0), moisture: m.moisture_pct != null ? Number(m.moisture_pct) : undefined,
    })) : [];
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
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = AI_MOCK_ONLY || !to;
  appendChatLog({ type: 'send-summary', to: to || '(none)', dryRun, text: summary });
  try {
    if (!dryRun) await pushLineMessage(to, { type: 'text', text: summary });
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
  const dryRun = AI_MOCK_ONLY || !to;
  appendChatLog({ type: 'send-weather', to: to || '(none)', dryRun, flex });
  try {
    if (!dryRun) await pushLineMessage(to, flex);
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
  const dryRun = AI_MOCK_ONLY || !to;
  appendChatLog({ type: 'send-tasks', to: to || '(none)', dryRun, flex });
  try {
    if (!dryRun) await pushLineMessage(to, flex);
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-tasks-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

router.post('/admin/ai/send/chat', async (req, res) => {
  const mock = loadMock();
  const text = buildChatText(mock.chatSamples || []);
  const to = (req.body.to || DEFAULT_RECIPIENT || '').trim();
  const dryRun = AI_MOCK_ONLY || !to;
  appendChatLog({ type: 'send-chat-transcript', to: to || '(none)', dryRun, text });
  try {
    if (!dryRun) await pushLineMessage(to, { type: 'text', text });
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
  const dryRun = AI_MOCK_ONLY || !to;
  appendChatLog({ type: 'send-cdp-digest', to: to || '(none)', dryRun, text });
  try {
    if (!dryRun) await pushLineMessage(to, { type: 'text', text });
    return res.redirect('/admin/ai');
  } catch (err) {
    appendChatLog({ type: 'send-cdp-digest-error', error: err?.message || 'unknown' });
    return res.status(500).send('Failed to send');
  }
});

export default router;
