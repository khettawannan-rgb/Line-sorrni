// project-root/src/services/ai/advisor.js

function percent(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return `${Math.round(Number(n) * 100)}%`;
}

export function buildWeatherFlex({ dateLabel, locationName, status, temp, advice, detailsUrl }) {
  const now = new Date();
  const dateText = dateLabel || now.toLocaleDateString('th-TH', { dateStyle: 'medium' });
  return {
    type: 'flex',
    altText: 'พยากรณ์อากาศวันนี้',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🌦️ พยากรณ์อากาศวันนี้', weight: 'bold', size: 'lg' },
          { type: 'text', text: dateText, size: 'sm', color: '#AAAAAA' },
          locationName ? { type: 'text', text: locationName, size: 'sm', color: '#AAAAAA' } : undefined,
        ].filter(Boolean),
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `สถานะ: ${status || 'ไม่ทราบ'}`, weight: 'bold', size: 'md', color: '#FF5555' },
          temp ? { type: 'text', text: `อุณหภูมิ: ${temp}`, size: 'sm', margin: 'md' } : undefined,
          advice ? { type: 'text', text: `คำแนะนำ: ${advice}`, size: 'sm', color: '#555555', wrap: true, margin: 'md' } : undefined,
        ].filter(Boolean),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', action: { type: 'message', label: 'อัพเดทอีกครั้ง', text: 'ส่ง mock data พยากรณ์' } },
          detailsUrl ? { type: 'button', style: 'secondary', action: { type: 'uri', label: 'ดูรายละเอียด', uri: detailsUrl } } : { type: 'spacer', size: 'sm' },
        ],
      },
    },
  };
}

export function analyzeWeatherSlots(weatherSlots = []) {
  // Find strongest impact slot
  const scored = (weatherSlots || []).map((w) => {
    const severity = (String(w.condition || '').includes('ฝน') ? 1 : 0) + (Number(w.rainProb || 0) / 100);
    return { ...w, severity };
  });
  scored.sort((a, b) => b.severity - a.severity);
  const worst = scored[0];
  const advice = worst && worst.severity > 0.8
    ? 'ไม่ควรมิกยางหรือปูยางช่วงฝนตก/เสี่ยงฝน เพื่อป้องกันคุณภาพงานต่ำ'
    : worst && worst.severity > 0.4
    ? 'ตรวจสภาพอากาศก่อนเริ่มงาน และเตรียมผ้าใบกันฝน/ป้องกันความชื้น'
    : 'สภาพอากาศเหมาะสมสำหรับเริ่มงาน แต่ควรตรวจพื้นผิวก่อนเสมอ';
  return { worst, advice };
}

export function generateDailySummary({ weather = [], materials = [], location = {}, team = [] } = {}) {
  const { worst, advice } = analyzeWeatherSlots(weather);
  const head = `สรุปประจำวัน – ${location.name || 'ไซต์งาน'}`;
  const wxLine = worst
    ? `อากาศช่วง ${worst.time}: ${worst.condition}, โอกาสฝน ${worst.rainProb}%`
    : 'อากาศ: -';
  const matLine = (materials || [])
    .map((m) => `${m.name}: ${Number(m.stockTons || 0).toLocaleString('th-TH')} ตัน${m.moisture ? ` (ความชื้น ${m.moisture}%)` : ''}`)
    .join('\n');
  const teamLine = team?.length ? `ทีมปฏิบัติการ: ${team.map((t) => t.name).join(', ')}` : '';
  return [
    `📣 ${head}`,
    wxLine,
    teamLine,
    '',
    'วัสดุ/สต็อก:',
    matLine || '-',
    '',
    `คำแนะนำ: ${advice}`,
  ].filter(Boolean).join('\n');
}

export function buildDailySummaryFlex({ weather = [], materials = [], location = {} } = {}) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const dateSlash = `${dd}/${mm}/${yyyy}`;
  const { worst, advice } = analyzeWeatherSlots(weather);

  // Build inbound/outbound mock from materials
  const byQty = [...(materials || [])].sort((a, b) => (Number(b.stockTons || 0) - Number(a.stockTons || 0)));
  const pickIcon = (name = '') => {
    const n = String(name).toLowerCase();
    if (/(หิน|stone|aggregate|3\/4)/.test(n)) return '🪨';
    if (/(ฝุ่น|dust|fine)/.test(n)) return '🌫️';
    if (/(ทราย|sand)/.test(n)) return '🏖️';
    return '📦';
  };
  const inboundItems = byQty.slice(0, 2).map((m) => `${pickIcon(m.name)} ${m.name}: ${Number(m.stockTons || 0).toLocaleString('th-TH')} ตัน`);
  const inboundTotal = byQty.slice(0, 2).reduce((a, m) => a + Number(m.stockTons || 0), 0);
  const outboundTons = Math.max(80, Math.round(inboundTotal * 1.4));

  const project = 'จ้างเหมาทำการขยายช่องจราจรจาก 2 เป็น 4 ช่องทางจราจร ทล.ที่ 12 สุพรรณบุรี';
  const place1 = location?.name || 'ทางหลวงหมายเลข 311';
  const place2 = 'ตอนควบคุม 0300 ตอน บ้านม้า – ชัยนาท';
  const span = 'ระยะทาง 1.455 กม. / พื้นที่ 31,485 ตร.ม.';
  const moreUrl = process.env.IO_MORE_URL || process.env.DAILY_IO_URL || 'https://app.nilasolutions.co/hmp/cm84i3gve7jm0cl01ayd6f2pj/inventory/analysis/weighbridge';

  const lines = [
    'ทดสอบบอทรายงานประจำวัน',
    `📌 รายงานประจำวัน ${dateSlash}`,
    '',
    '📥 ขาเข้า (วัตถุดิบ)',
    ...(inboundItems.length ? inboundItems : ['—']),
    `รวมขาเข้า : ${inboundTotal.toLocaleString('th-TH')} ตัน`,
    '',
    '📤 ขาออก',
    `🛣️ แอสฟัลต์ติกคอนกรีต : ${outboundTons.toLocaleString('th-TH')} ตัน`,
    '',
    `➡️ โครงการ: ${project}`,
    '',
    `📍 สถานที่: ${place1}`,
    place2,
    `📏 ${span}`,
    '',
    '💡 คำแนะนำ',
    advice,
    '',
    '🔗 ดูข้อมูลเพิ่มเติมได้ที่ :',
    moreUrl,
  ];

  return {
    type: 'flex',
    altText: 'สรุปรายงานประจำวัน',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', contents: (
          lines.map((t) => ({ type: 'text', text: t, wrap: true, size: 'sm' }))
        ),
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'primary', action: { type: 'uri', label: 'เปิดรายงาน', uri: moreUrl } },
          { type: 'button', style: 'secondary', action: { type: 'message', label: 'ขอคำแนะนำ', text: 'ขอคำแนะนำเพิ่มเติม' } },
        ],
      },
    },
  };
}

export function buildAdviceForConditions({ tempC, humidity, condition } = {}) {
  const tips = [];
  if (/ฝน/.test(String(condition || ''))) tips.push('หลีกเลี่ยงการปูยาง/มิกยางในช่วงฝนตก');
  if (Number(humidity) > 80) tips.push('ควรตรวจความชื้นของวัสดุก่อนใช้งาน');
  if (Number(tempC) < 18) tips.push('อุ่นวัสดุให้ได้อุณหภูมิที่เหมาะสมก่อนใช้งาน');
  if (!tips.length) tips.push('สภาพอากาศเหมาะสม ตรวจพื้นผิวก่อนเริ่มงาน');
  return tips;
}

export default {
  buildWeatherFlex,
  analyzeWeatherSlots,
  generateDailySummary,
  buildDailySummaryFlex,
  buildAdviceForConditions,
  percent,
};

// Additional helpers for tasks, chat, and CDP digest
export function buildTaskRecommendationsFlex(items = []) {
  const lines = (items || []).map((t, i) => {
    const tag = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟠' : '🟢';
    const head = `${tag} ${t.message}`;
    const sub = [t.reason, t.suggest].filter(Boolean).join(' • ');
    return { type: 'box', layout: 'vertical', spacing: 'xs', contents: [
      { type: 'text', text: head, wrap: true, weight: 'bold', size: 'sm' },
      { type: 'text', text: sub || '-', wrap: true, size: 'xs', color: '#6B7280' },
    ]};
  });
  return {
    type: 'flex',
    altText: 'Task Recommendations',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: '🧭 Task Recommendations', weight: 'bold', size: 'lg' },
        { type: 'text', text: 'ข้อเสนอแนะเชิงคาดการณ์', size: 'sm', color: '#AAAAAA' },
      ]},
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: lines.length ? lines : [ { type: 'text', text: 'ไม่มีคำแนะนำ', size: 'sm' } ] },
    },
  };
}

export function buildChatTranscriptText(items = []) {
  const mapLine = (it) => {
    const t = new Date(it.time || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const body = it?.message?.type === 'text' ? it.message.text
      : it?.message?.type === 'image' ? '[ภาพถ่าย]'
      : it?.message?.type === 'location' ? `[ตำแหน่ง] ${it.message.title || ''}`
      : '[ข้อความ]';
    return `${t} • ${it.from || 'user'}: ${body}`;
  };
  return ['บันทึกแชทล่าสุด', ...(items || []).slice(-10).map(mapLine)].join('\n');
}

export function buildChatTranscriptFlex(items = []) {
  const lines = (items || []).slice(-8).map((it) => {
    const t = new Date(it.time || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const body = it?.message?.type === 'text' ? it.message.text
      : it?.message?.type === 'image' ? '[ภาพถ่าย]'
      : it?.message?.type === 'location' ? `[ตำแหน่ง] ${it.message.title || ''}`
      : '[ข้อความ]';
    return `${t} • ${it.from || 'user'}: ${body}`;
  });

  return {
    type: 'flex',
    altText: 'Chat Transcript',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: '🗒️ Chat Transcript', weight: 'bold', size: 'lg' },
        { type: 'text', text: 'บันทึกแชทล่าสุด', size: 'sm', color: '#6B7280' },
      ]},
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', contents:
          (lines.length ? lines : ['ยังไม่มีข้อมูล']).map((txt) => ({ type: 'text', text: txt, wrap: true, size: 'sm', color: '#0f172a' })),
      },
    },
  };
}

export function buildCdpDigestText(cdp = {}) {
  const s = cdp?.summary || {};
  const segs = (cdp?.segments || []).map((g) => `${g.label}: ${g.users}`).join(' • ');
  const preds = (cdp?.predictive || []).map((p) => `- ${p.message}`).join('\n');
  return [
    '📊 CDP Digest',
    `DAU: ${s.dailyActive || 0} • WAU: ${s.weeklyActive || 0}`,
    `New 7d: ${s.newUsers7d || 0} • Returning 7d: ${s.returning7d || 0}`,
    `Messages 7d: ${s.messages7d || 0}`,
    segs ? `Segments → ${segs}` : '',
    preds ? '\nPredictive Alerts:\n' + preds : '',
  ].filter(Boolean).join('\n');
}

export { buildTaskRecommendationsFlex as buildTasksFlex, buildChatTranscriptText as buildChatText, buildCdpDigestText as buildCdpText };
