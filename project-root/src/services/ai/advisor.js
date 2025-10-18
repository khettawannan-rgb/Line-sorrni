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
  const dateText = new Date().toLocaleDateString('th-TH', { dateStyle: 'medium' });
  const site = location?.name || 'ไซต์งาน';
  const { worst } = analyzeWeatherSlots(weather);
  const wxText = worst
    ? `${worst.time} · ${worst.condition} · ฝน ${worst.rainProb || 0}%`
    : '—';
  const topMats = (materials || [])
    .slice(0, 4)
    .map((m) => `${m.name || '-'} ${Number(m.stockTons || 0).toLocaleString('th-TH')} ตัน${m.moisture != null ? ` • ชื้น ${m.moisture}%` : ''}`);

  return {
    type: 'flex',
    altText: 'สรุปประจำวัน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📣 Daily Summary', weight: 'bold', size: 'lg' },
          { type: 'text', text: dateText, size: 'sm', color: '#888888' },
          { type: 'text', text: site, size: 'sm', color: '#888888' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: 'สภาพอากาศ', weight: 'bold', size: 'sm' },
          { type: 'text', text: wxText, size: 'sm', color: '#475569' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'วัสดุ/คงเหลือ', weight: 'bold', size: 'sm', margin: 'md' },
          ...(
            topMats.length
              ? topMats.map((t) => ({ type: 'text', text: `• ${t}`, size: 'sm', color: '#475569', wrap: true }))
              : [{ type: 'text', text: '—', size: 'sm', color: '#9ca3af' }]
          ),
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'primary', action: { type: 'message', label: 'ส่งสรุปอีกครั้ง', text: 'ขอสรุปประจำวัน' } },
          { type: 'spacer', size: 'sm' },
        ] },
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
