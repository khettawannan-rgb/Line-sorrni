// Rebuild with mini S-curve via QuickChart
function ci() {
  return {
    primary: process.env.CI_PRIMARY || '#0ea5e9',
    text: process.env.CI_TEXT || '#0f172a',
    soft: process.env.CI_SOFT || '#eef2ff',
    good: process.env.CI_ACCENT_GOOD || '#22c55e',
    warn: process.env.CI_ACCENT_WARN || '#f59e0b',
    plan: '#94a3b8',
  };
}

function chartUrl(points, primary, plan) {
  const labels = (points || []).map((p) => p.day);
  const planData = (points || []).map((p) => p.plan);
  const actualData = (points || []).map((p) => p.actual);
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Plan', data: planData, borderColor: plan, backgroundColor: plan, borderWidth: 2, tension: 0.25, fill: false },
        { label: 'Actual', data: actualData, borderColor: primary, backgroundColor: primary, borderWidth: 2, tension: 0.25, fill: false },
      ],
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } },
  };
  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?w=640&h=200&c=${encoded}`;
}

export function buildDailySummaryFlex(summary) {
  const c = ci();
  const bubbles = [];
  const ovChart = chartUrl(summary.portfolio_s_curve || [], c.primary, c.plan);

  bubbles.push({
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', backgroundColor: c.soft, paddingAll: '16px', contents: [
      { type: 'text', text: '📅 Daily Overview', weight: 'bold', size: 'lg', color: c.text },
      { type: 'text', text: `วันที่ ${summary.date}`, size: 'sm', color: '#64748b' },
      { type: 'separator', margin: 'md' },
      { type: 'box', layout: 'baseline', margin: 'md', contents: [ { type: 'text', text: 'ไซต์ทั้งหมด', size: 'sm', color: '#64748b' }, { type: 'text', text: String(summary.total_sites), weight: 'bold', size: 'sm', align: 'end', color: c.text, flex: 2 } ] },
      { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: 'งานทั้งหมด', size: 'sm', color: '#64748b' }, { type: 'text', text: `${summary.completed_tasks}/${summary.total_tasks}`, weight: 'bold', size: 'sm', align: 'end', color: c.text, flex: 2 } ] },
      { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: 'บวก/ลบ (ไซต์)', size: 'sm', color: '#64748b' }, { type: 'text', text: `${summary.pos_sites}/${summary.neg_sites}`, weight: 'bold', size: 'sm', align: 'end', color: c.text, flex: 2 } ] },
      { type: 'image', url: ovChart, size: 'full', aspectRatio: '6:2', margin: 'md' },
      { type: 'text', text: `ภาพรวมตามแผน ${summary.portfolio_plan_pct}%`, size: 'sm', color: c.text, margin: 'sm' },
      { type: 'text', text: summary.top_risks?.length ? `ความเสี่ยง: ${summary.top_risks.join(' • ')}` : 'ไม่มีความเสี่ยงเด่น', size: 'sm', color: c.warn, wrap: true, margin: 'sm' },
      ...(summary.portfolio_notes?.positive_notes?.length ? [{ type: 'text', text: `✅ ${summary.portfolio_notes.positive_notes[0]}`, size: 'sm', color: c.good, wrap: true }] : []),
      ...(summary.portfolio_notes?.negative_notes?.length ? [{ type: 'text', text: `⚠️ ${summary.portfolio_notes.negative_notes[0]}`, size: 'sm', color: c.warn, wrap: true }] : []),
    ] },
  });

  (summary.sites || []).forEach((s) => {
    const sChart = chartUrl(s.s_curve || [], c.primary, c.plan);
    const good = s.outcome?.quality_pass && Number(s.outcome?.delays || 0) === 0;
    bubbles.push({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', backgroundColor: c.soft, paddingAll: '16px', contents: [
        { type: 'text', text: s.site_name, weight: 'bold', size: 'md', color: c.text, wrap: true },
        { type: 'text', text: s.province, size: 'sm', color: '#64748b' },
        good ? { type: 'text', text: 'On track', size: 'sm', color: c.good } : (s.outcome?.delays || s.outcome?.rework) ? { type: 'text', text: 'Delay/Rework', size: 'sm', color: c.warn } : { type: 'spacer', size: 'sm' },
        { type: 'box', layout: 'baseline', margin: 'md', contents: [ { type: 'text', text: '%แผนไซต์', size: 'sm', color: '#64748b' }, { type: 'text', text: `${s.site_plan_pct}%`, weight: 'bold', size: 'sm', align: 'end', color: c.text, flex: 2 } ] },
        { type: 'text', text: s.done_vs_total, size: 'sm', color: c.text },
        { type: 'text', text: s.key_line, size: 'sm', color: c.text, wrap: true, margin: 'sm' },
        { type: 'text', text: `เวลา: ${s.start_end_span}`, size: 'xs', color: '#64748b' },
        { type: 'text', text: s.risks?.length ? `ความเสี่ยง: ${s.risks.join(' • ')}` : 'ไม่มีความเสี่ยงเด่น', size: 'sm', color: c.warn, wrap: true, margin: 'sm' },
        { type: 'image', url: sChart, size: 'full', aspectRatio: '6:2', margin: 'md' },
      ] },
      footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        { type: 'button', style: 'primary', color: c.primary, action: { type: 'uri', label: 'ดูแผนที่', uri: `https://maps.google.com/?q=${s.lat},${s.lng}&z=15` } },
        { type: 'button', style: 'secondary', action: { type: 'uri', label: 'ดูรูปวันนี้ (Mock)', uri: '/liff/index.html?game=sign' } },
      ] },
    });
  });

  return { type: 'flex', altText: 'Daily Summary', contents: { type: 'carousel', contents: bubbles } };
}

export default { buildDailySummaryFlex };
