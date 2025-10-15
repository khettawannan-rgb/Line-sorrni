import rules from './rules.weather.json' assert { type: 'json' };

const RISK_LABEL = {
  RAIN: 'ฝน',
  WIND: 'ลมแรง',
  HEAT: 'อากาศร้อน',
  COLD: 'อุณหภูมิต่ำ',
  THUNDER: 'พายุฝนฟ้าคะนอง',
  HUMID: 'ความชื้นสูง',
  OK: 'สภาพเหมาะสม',
};

const SEVERITY_BADGE = {
  high: '🔴 ระดับสูง',
  medium: '🟠 ระดับกลาง',
  low: '🟡 เฝ้าระวัง',
};

const ACTION_PRESETS = {
  RAIN: {
    high: {
      site: ['งดปูผิวทาง / งานบดอัด', 'ชะลอการพ่นแทค/ไพร์ม', 'คลุมวัสดุ ตรวจรางระบายน้ำ'],
      plant: ['ลดคิวการผสมช่วงฝนหนัก', 'กันน้ำเข้าสโตเรจแบบ', 'เตรียมพื้นที่พักวัสดุแห้ง']
    },
    medium: {
      site: ['เตรียมผ้าใบคลุม', 'เฝ้าระวังการสะสมของน้ำบนผิวงาน'],
      plant: ['วางแผนตัดคิวผสมช่วงฝน', 'เช็กปั๊มระบายน้ำ']
    },
    low: {
      site: ['ประเมินพื้นที่ต่ำ ระบายน้ำล่วงหน้า'],
      plant: ['เตรียมคลุมวัสดุเบื้องต้น']
    }
  },
  WIND: {
    high: {
      site: ['งดพ่นแทค/ไพร์ม เพื่อลด overspray', 'กั้นพื้นที่เสี่ยงวัสดุปลิว'],
      plant: ['ตรวจสภาพท่อและสายส่ง', 'แจ้งทีมขนส่งขับด้วยความระมัดระวัง']
    },
    medium: {
      site: ['เพิ่มกำลังคนควบคุมงานพ่น', 'ตรวจจุดกั้นสัญญาณเตือน'],
      plant: ['เตรียมปรับมุมฉีดของหัวพ่น']
    }
  },
  HEAT: {
    high: {
      site: ['จัดรอบงานสั้นลง เพิ่มจุดพักร่ม', 'จัดเตรียมน้ำและสารละลายเกลือแร่'],
      plant: ['ปรับเวลาผสมเป็นช่วงเช้าตรู่/ค่ำ', 'ตรวจจับอุณหภูมิยางก่อนส่งหน้างาน']
    },
    medium: {
      site: ['เริ่มงานแต่เช้า/เย็น ลดงานช่วงบ่าย'],
      plant: ['แจ้งทีมเดินเครื่องให้เฝ้าระวังอุณหภูมิผลิต']
    }
  },
  COLD: {
    medium: {
      site: ['เพิ่มเวลาวางยางให้หนาขึ้น', 'เตรียมเครื่องมือบดอัดให้พร้อม'],
      plant: ['ตรวจสอบอุณหภูมิปล่อยยางไม่ต่ำเกินไป']
    },
    low: {
      site: ['เฝ้าระวังการแข็งตัวของอีมัลชันตอนเช้า'],
      plant: ['อุ่นถังเก็บให้ถึงขั้นต่ำที่กำหนด']
    }
  },
  THUNDER: {
    high: {
      site: ['หยุดงานกลางแจ้งทันทีหากมีฟ้าแลบใกล้', 'ย้ายเครื่องจักรเข้าพื้นที่ปลอดภัย'],
      plant: ['งดจ่ายวัสดุจนกว่าพายุจะผ่าน', 'ตรวจระบบไฟฟ้าสำรอง']
    }
  },
  OK: {
    low: {
      site: ['สามารถปูและบดอัดได้ตามแผน', 'เดินเครื่องตามปกติ'],
      plant: ['ผลิตและส่งยางได้ตามปกติ', 'รักษาระดับสำรองตามแผน']
    }
  }
};

const DEFAULT_ACTION = { site: ['ตรวจสอบหน้างานตามปกติ'], plant: ['ผลิตและจ่ายวัสดุตามแผน'] };

function groupWindows(hourly = [], predicate) {
  const windows = [];
  let current = null;
  hourly.forEach((entry) => {
    if (!entry?.time) return;
    if (predicate(entry)) {
      if (!current) current = { from: entry.time, to: entry.time };
      current.to = entry.time;
    } else if (current) {
      windows.push(current);
      current = null;
    }
  });
  if (current) windows.push(current);
  return windows;
}

function severityOrder(risks) {
  if (!risks.length) return 'low';
  if (risks.some((r) => r.severity === 'high')) return 'high';
  if (risks.some((r) => r.severity === 'medium')) return 'medium';
  return 'low';
}

function getActions(tag, severity) {
  const preset = ACTION_PRESETS[tag]?.[severity];
  if (preset) return preset;
  return DEFAULT_ACTION;
}

function formatWindow(window) {
  if (!window) return '';
  const from = window.from?.slice(11, 16) || window.from;
  const to = window.to?.slice(11, 16) || window.to;
  return from && to && from !== to ? `${from}-${to}` : from || to || '';
}

function buildBulletLine(risk) {
  const badge = SEVERITY_BADGE[risk.severity] || '🟡';
  const window = formatWindow(risk.window);
  const windowNote = window ? ` (${window})` : '';
  return `• ${badge} ${RISK_LABEL[risk.tag] || risk.tag}${windowNote} – ${risk.reason}`;
}

export function buildWeatherAdvice(input) {
  const {
    locationText = 'พื้นที่ปฏิบัติงาน',
    now = {},
    today = {},
    hourly = [],
    source = 'mock',
    updatedAt = new Date().toISOString(),
  } = input || {};

  const risks = [];
  const rainRules = rules.rain;
  const heatRules = rules.heat;
  const windRules = rules.wind;
  const coldRules = rules.cold;
  const thunderRules = rules.thunder;

  const hourlyRain = hourly.map((h) => Number(h?.rainMm || 0));
  const hourlyWind = hourly.map((h) => Number(h?.windKmh || h?.wind || 0));
  const hourlyHumidity = hourly.map((h) => Number(h?.humidity || 0));
  const hourlyCodes = hourly.map((h) => Number(h?.wcode || h?.weatherCode));

  const maxHourlyRain = Math.max(0, ...hourlyRain);
  const maxWind = Math.max(Number(now.windKmh || 0), ...hourlyWind);
  const maxHumidity = Math.max(Number(now.humidity || 0), ...hourlyHumidity);
  const maxCode = Math.max(...hourlyCodes.filter((c) => Number.isFinite(c)), Number(now.wcode || 0));

  // Rain logic
  if (maxHourlyRain >= rainRules.holdPavingMmPerHr || Number(today.rainMm || 0) >= rainRules.holdByDailyMm) {
    const window = groupWindows(hourly, (h) => Number(h.rainMm || 0) >= rainRules.holdPavingMmPerHr)[0];
    const actions = getActions('RAIN', 'high');
    risks.push({
      tag: 'RAIN',
      severity: 'high',
      window,
      reason: `ปริมาณฝนคาด ${maxHourlyRain.toFixed(1)} มม./ชม. (${formatWindow(window) || 'ช่วงฝน'}), เกิน ${rainRules.holdPavingMmPerHr} มม./ชม.`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  } else if (maxHourlyRain >= rainRules.lightMaxMmPerHr) {
    const window = groupWindows(hourly, (h) => Number(h.rainMm || 0) >= rainRules.lightMaxMmPerHr)[0];
    const actions = getActions('RAIN', 'medium');
    risks.push({
      tag: 'RAIN',
      severity: 'medium',
      window,
      reason: `มีฝนคาด ${maxHourlyRain.toFixed(1)} มม./ชม. (${formatWindow(window) || 'ระยะสั้น'})`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  // Wind logic
  if (maxWind >= windRules.tackSprayHoldKmh) {
    const window = groupWindows(hourly, (h) => Number(h.windKmh || h.wind || 0) >= windRules.tackSprayHoldKmh)[0];
    const actions = getActions('WIND', 'high');
    risks.push({
      tag: 'WIND',
      severity: 'high',
      window,
      reason: `ลม ${maxWind.toFixed(0)} กม./ชม. เกิน ${windRules.tackSprayHoldKmh} กม./ชม.`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  } else if (maxWind >= windRules.tackSprayCautionKmh) {
    const window = groupWindows(hourly, (h) => Number(h.windKmh || h.wind || 0) >= windRules.tackSprayCautionKmh)[0];
    const actions = getActions('WIND', 'medium');
    risks.push({
      tag: 'WIND',
      severity: 'medium',
      window,
      reason: `ลม ${maxWind.toFixed(0)} กม./ชม. (เกิน ${windRules.tackSprayCautionKmh})`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  // Heat logic
  const tMax = Number(today.tMaxC || now.tempC || 0);
  if (tMax >= heatRules.crewDangerC || (tMax >= heatRules.crewCautionC && maxHumidity >= heatRules.humidityHigh)) {
    const severity = tMax >= heatRules.crewDangerC ? 'high' : 'medium';
    const actions = getActions('HEAT', severity);
    risks.push({
      tag: 'HEAT',
      severity,
      reason: `คาดสูงสุด ${tMax.toFixed(1)}°C, ความชื้น ${Math.max(maxHumidity, Number(now.humidity || 0)).toFixed(0)}%`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  // Cold logic
  const tMin = Number(today.tMinC || now.tempC || 0);
  if (tMin > 0 && tMin < coldRules.pavingMinAmbientC) {
    const actions = getActions('COLD', 'medium');
    risks.push({
      tag: 'COLD',
      severity: 'medium',
      reason: `อุณหภูมิต่ำสุด ${tMin.toFixed(1)}°C ต่ำกว่าเกณฑ์ ${coldRules.pavingMinAmbientC}°C`,
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  // Thunder logic
  if (thunderRules.weatherCodes.includes(maxCode)) {
    const window = groupWindows(hourly, (h) => thunderRules.weatherCodes.includes(Number(h?.wcode || h?.weatherCode)))[0];
    const actions = getActions('THUNDER', 'high');
    risks.push({
      tag: 'THUNDER',
      severity: 'high',
      window,
      reason: 'พบสัญญาณพายุฝนฟ้าคะนองในช่วงคาดการณ์',
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  if (!risks.length) {
    const actions = getActions('OK', 'low');
    risks.push({
      tag: 'OK',
      severity: 'low',
      reason: 'สภาพอากาศเหมาะสมสำหรับงานปูและบดอัด',
      actionsSite: actions.site,
      actionsPlant: actions.plant,
    });
  }

  const summarySeverity = severityOrder(risks);
  const summaryBadge = SEVERITY_BADGE[summarySeverity] || '🟡';
  const summary = `${summaryBadge} ${locationText} — สภาพโดยรวม ${summarySeverity === 'high' ? 'มีความเสี่ยงสูง' : summarySeverity === 'medium' ? 'มีจุดที่ต้องเฝ้าระวัง' : 'เหมาะสมสำหรับการทำงาน'}`;

  const nowText = [
    `${Number(now.tempC || today.tMaxC || 0).toFixed(1)}°C`,
    `ลม ${Number(now.windKmh || 0).toFixed(1)} กม./ชม.`,
  ];
  if (Number(now.rainMm || 0) > 0) nowText.push(`ฝน ${Number(now.rainMm).toFixed(1)} มม.`);

  const dayText = `สูงสุด ${Number(today.tMaxC || 0).toFixed(1)}°C · ต่ำสุด ${Number(today.tMinC || 0).toFixed(1)}°C · ฝนคาด ${Number(today.rainMm || 0).toFixed(1)} มม.`;

  const formattedTextLines = [
    `พยากรณ์อากาศบริเวณ ${locationText}`,
    `ตอนนี้ ${nowText.join(' · ')}`,
    dayText,
    'ความคิดเห็นสำหรับงานวันนี้:',
    ...risks.map(buildBulletLine),
    'ข้อแนะนำสำหรับแพลนท์: ' + (risks[0]?.actionsPlant?.join(', ') || 'ผลิตและจ่ายตามแผน'),
    'ข้อมูลจาก ' + (source === 'open-meteo' ? 'Open-Meteo' : 'โมเดลตัวอย่าง') + ` อัปเดต ${new Date(updatedAt).toLocaleString('th-TH')}`,
  ];

  const formattedText = formattedTextLines.join('\n');

  const confidence = source === 'open-meteo'
    ? (hourly?.length >= 6 ? 'high' : 'medium')
    : 'low';

  return {
    summary,
    risks,
    formattedText,
    confidence,
    overallSeverity: summarySeverity,
  };
}

export function buildWeatherAdviceFromScenario(scenario, loader) {
  if (!scenario || !loader) return null;
  try {
    const data = loader(scenario);
    if (!data) return null;
    return buildWeatherAdvice(data);
  } catch (err) {
    console.warn('[ADVICE] scenario load error', scenario, err?.message || err);
    return null;
  }
}
