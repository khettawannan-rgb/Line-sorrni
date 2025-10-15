#!/usr/bin/env node
import { buildStockAlert } from '../project-root/src/services/stock/stock-alert.js';
import stockMock from '../project-root/src/services/stock/mocks/stock.json' assert { type: 'json' };

const scenario = process.argv[2];
let stockData = stockMock;
if (scenario) {
  const module = await import(`../project-root/src/services/stock/mocks/${scenario}.json`, { assert: { type: 'json' } }).catch(() => null);
  if (module) stockData = module.default || module;
}
const alert = buildStockAlert(stockData.items, null, { baseUrl: 'https://example.com', companyId: 'demo', uuid: 'mock-user' });
console.log('=== Stock Alert Scenario:', scenario || 'default', '===');
console.log(alert.formattedText);
