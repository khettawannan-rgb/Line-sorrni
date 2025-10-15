import rules from './replenishment-rules.json' assert { type: 'json' };
import stockMock from './mocks/stock.json' assert { type: 'json' };

const STATUS_BADGE = {
  URGENT: '🔴 ด่วน',
  LOW: '🟠 ใกล้หมด',
  OK: '🟢 ปกติ'
};

function usageMultiplierFromAdvice(advice) {
  if (!advice || !Array.isArray(advice.risks)) return rules.okUsageMultiplier || 1;
  const risks = advice.risks;
  if (risks.some((r) => r.tag === 'THUNDER' && r.severity !== 'low')) {
    return rules.thunderUsageMultiplier ?? 0.5;
  }
  if (risks.some((r) => r.tag === 'RAIN' && r.severity === 'high')) {
    return rules.thunderUsageMultiplier ?? 0.5;
  }
  if (risks.some((r) => r.tag === 'RAIN' && r.severity === 'medium')) {
    return rules.rainUsageMultiplier ?? 0.6;
  }
  if (risks.some((r) => r.tag === 'HEAT' && r.severity !== 'low')) {
    return rules.heatUsageMultiplier ?? 1.15;
  }
  return rules.okUsageMultiplier ?? 1;
}

function statusFromDos(dos, item) {
  if (item.currentQty <= item.reorderPoint || dos <= (rules.urgencyDays ?? 1.5)) return 'URGENT';
  if (dos <= (item.leadTimeDays ?? 2) || dos <= (rules.lowDays ?? 3)) return 'LOW';
  return 'OK';
}

function formatQty(value, unit) {
  if (value >= 1000 && unit.toLowerCase() === 'ลิตร') {
    return `${(value / 1000).toFixed(1)} พันลิตร`;
  }
  if (value >= 1000 && unit.toLowerCase() === 'ตัน') {
    return `${value.toFixed(1)} ตัน`;
  }
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${unit}`;
}

function buildSuggestion(item, status, orderQty) {
  if (status === 'OK') {
    return 'คงระดับสต็อกตามแผน';
  }
  const reasons = [];
  if (item.currentQty <= item.reorderPoint) reasons.push('ต่ำกว่า ROP');
  if ((item.currentQty / Math.max(1, item.avgDailyUsage)) <= (item.leadTimeDays ?? 2)) {
    reasons.push('เพียงพอไม่ถึง Lead time');
  }
  return `แนะนำสั่ง ${formatQty(orderQty, item.unit)} (${reasons.join(', ')})`;
}

export function buildStockAlert(stockList = stockMock.items, advice = null, opts = {}) {
  const usageFactor = usageMultiplierFromAdvice(advice);
  const linkBase = opts.baseUrl || '';
  const uuid = opts.uuid || '';
  const companyId = opts.companyId || 'demo';

  const siteGroups = stockList.reduce((acc, item) => {
    const key = item.siteId || 'default';
    if (!acc[key]) acc[key] = { siteName: item.siteName || 'ไซต์หลัก', items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  const alerts = Object.values(siteGroups).map((group) => {
    const lines = [];
    const items = group.items.map((item) => {
      const adjUsage = Math.max(1, item.avgDailyUsage || 1) * usageFactor;
      const dos = item.currentQty / adjUsage;
      const status = statusFromDos(dos, item);
      const leadDays = item.leadTimeDays ?? 2;
      const target = (leadDays + 2) * (item.avgDailyUsage || 1) * (rules.defaultSafetyFactor || 1.2);
      const orderQtyRaw = Math.max(item.safetyStock || 0, target - item.currentQty);
      const orderQty = Math.max(Math.ceil(orderQtyRaw), item.safetyStock || 0);
      const suggestion = buildSuggestion(item, status, orderQty);
      const poLink = `${linkBase}/liff/po?item=${encodeURIComponent(item.itemName)}&qty=${encodeURIComponent(orderQty)}&companyId=${encodeURIComponent(companyId)}${uuid ? `&uuid=${encodeURIComponent(uuid)}` : ''}`;

      if (status !== 'OK') {
        lines.push(`${STATUS_BADGE[status]} ${item.itemName}: คงเหลือ ${formatQty(item.currentQty, item.unit)} (DoS ${dos.toFixed(1)} วัน) → ${suggestion}`);
      }

      return {
        itemName: item.itemName,
        currentQty: formatQty(item.currentQty, item.unit),
        unit: item.unit,
        dos: Number(dos.toFixed(2)),
        status,
        suggestion,
        poLink,
      };
    });

    const formattedText = lines.length
      ? `⚠️ Safety Stock Alert – ${group.siteName}\n${lines.join('\n')}`
      : `✅ สต็อก ${group.siteName} อยู่ในเกณฑ์ปลอดภัย`; 

    return {
      siteName: group.siteName,
      items,
      formattedText,
    };
  });

  return alerts.length === 1 ? alerts[0] : { siteName: 'รวม', groups: alerts, formattedText: alerts.map((a) => a.formattedText).join('\n\n') };
}

export async function buildStockAlertFromScenario(scenario) {
  if (!scenario) return buildStockAlert();
  try {
    const mock = await import(`./mocks/${scenario}.json`, { assert: { type: 'json' } });
    const dataset = mock?.default || mock;
    return buildStockAlert(dataset.items || dataset?.default?.items || []);
  } catch (err) {
    console.warn('[STOCK] scenario error', scenario, err?.message || err);
    return buildStockAlert();
  }
}

export { stockMock };
