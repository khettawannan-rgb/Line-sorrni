import { Router } from 'express';
import { buildWeatherAdvice } from '../services/advice/weather-advice.js';
import { buildFlexWeatherAdvice } from '../line/buildFlexWeatherAdvice.js';
import { buildStockAlert } from '../services/stock/stock-alert.js';
import { buildFlexStockAlert } from '../line/buildFlexStockAlert.js';
import stockMock from '../services/stock/mocks/stock.json' with { type: 'json' };

const router = Router();

const FEATURE_WEATHER = String(process.env.FEATURE_WEATHER_ADVICE || '').toLowerCase() === 'true';
const FEATURE_STOCK = String(process.env.FEATURE_STOCK_ALERTS || '').toLowerCase() === 'true';

async function loadWeatherScenario(name) {
  const module = await import(`../services/advice/mocks/${name}.json`, { with: { type: 'json' } });
  return module.default || module;
}

async function loadStockScenario(name) {
  const module = await import(`../services/stock/mocks/${name}.json`, { with: { type: 'json' } });
  return module.default || module;
}

router.post('/advice/weather', async (req, res) => {
  if (!FEATURE_WEATHER) return res.status(404).json({ error: 'feature disabled' });
  try {
    const advice = buildWeatherAdvice(req.body);
    res.json(advice);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'invalid payload' });
  }
});

router.get('/demo/weather-advice', async (req, res) => {
  if (!FEATURE_WEATHER) return res.status(404).json({ error: 'feature disabled' });
  const scenario = req.query.scenario || 'ok';
  try {
    const data = await loadWeatherScenario(scenario);
    const advice = buildWeatherAdvice(data);
    const flex = buildFlexWeatherAdvice(advice);
    res.json({ scenario, advice, flex });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'scenario not found' });
  }
});

router.get('/api/stock/alert', async (req, res) => {
  if (!FEATURE_STOCK) return res.status(404).json({ error: 'feature disabled' });
  const scenario = req.query.scenario;
  const adviceScenario = req.query.advice;
  try {
    let stockData = stockMock;
    if (scenario) {
      const dataset = await loadStockScenario(scenario);
      stockData = dataset;
    }
    let advice = null;
    if (adviceScenario && FEATURE_WEATHER) {
      const adviceData = await loadWeatherScenario(adviceScenario);
      advice = buildWeatherAdvice(adviceData);
    }
    const baseUrl = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : '';
    const alert = buildStockAlert(stockData.items, advice, {
      baseUrl,
      companyId: req.query.companyId || process.env.DEFAULT_COMPANY_ID || 'demo',
      uuid: req.query.uuid || '',
    });
    res.json(alert);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'cannot build alert' });
  }
});

router.get('/demo/stock-alert', async (req, res) => {
  if (!FEATURE_STOCK) return res.status(404).json({ error: 'feature disabled' });
  const scenario = req.query.scenario;
  try {
    let stockData = stockMock;
    if (scenario) {
      stockData = await loadStockScenario(scenario);
    }
    const alert = buildStockAlert(stockData.items);
    const flex = buildFlexStockAlert(alert);
    res.json({ scenario: scenario || 'default', alert, flex });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'scenario not found' });
  }
});

export default router;
