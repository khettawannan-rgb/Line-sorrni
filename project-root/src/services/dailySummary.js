// project-root/src/services/dailySummary.js
import DAILY_REPORTS from '../mock/dailyReports.js';

export function summarizeDaily(data) {
  const total_sites = data.sites.length;
  const tasks = data.sites.flatMap((s) => s.tasks);
  const total_tasks = tasks.length;
  const completed_tasks = tasks.filter((t) => Number(t.progress_pct || 0) >= 100).length;
  const total_photos = tasks.reduce((a, t) => a + Number(t.photos || 0), 0);
  const total_locations = tasks.reduce((a, t) => a + Number(t.locations || 0), 0);

  const allIssues = tasks.flatMap((t) => t.issues || []);
  const riskCount = {};
  allIssues.forEach((i) => (riskCount[i] = (riskCount[i] || 0) + 1));
  const top_risks = Object.entries(riskCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const sites = data.sites.map((s) => {
    const done = s.tasks.filter((t) => Number(t.progress_pct || 0) >= 100).length;
    const asphaltQty = s.tasks
      .filter((t) => t.category === 'งานยาง')
      .reduce((a, t) => a + Number(t.quantity || 0), 0);
    const asphaltUnit = s.tasks.find((t) => t.category === 'งานยาง')?.unit || 'ตัน';
    const inspectQty = s.tasks
      .filter((t) => t.category === 'ตรวจสอบ')
      .reduce((a, t) => a + Number(t.quantity || 0), 0);
    const inspectUnit = s.tasks.find((t) => t.category === 'ตรวจสอบ')?.unit || 'จุด';
    const key_line = [`🛣️ ${asphaltQty} ${asphaltUnit}`, `✅ ${inspectQty} ${inspectUnit}`].join(' • ');
    const start_end_span = `${s.tasks.map((t) => t.start).sort()[0]}–${s.tasks
      .map((t) => t.end)
      .sort()
      .slice(-1)[0]}`;
    const risks = Array.from(new Set(s.tasks.flatMap((t) => t.issues || []))).slice(0, 2);
    return {
      site_name: s.site_name,
      province: s.province,
      start_end_span,
      site_plan_pct: s.site_plan_pct,
      done_vs_total: `${done}/${s.tasks.length} งาน`,
      key_line,
      risks,
      lat: s.lat,
      lng: s.lng,
      site_id: s.site_id,
      s_curve: s.s_curve || [],
      outcome: s.site_outcome || {},
    };
  });

  return {
    date: data.date,
    total_sites,
    total_tasks,
    completed_tasks,
    total_photos,
    total_locations,
    portfolio_plan_pct: data.portfolio_plan_pct,
    top_risks,
    // positive / negative counts (simple rule)
    pos_sites: data.sites.filter((s) => s.site_outcome?.quality_pass && Number(s.site_outcome?.delays || 0) === 0).length,
    neg_sites: data.sites.length - data.sites.filter((s) => s.site_outcome?.quality_pass && Number(s.site_outcome?.delays || 0) === 0).length,
    portfolio_s_curve: data.s_curve || [],
    portfolio_notes: data.portfolio_outcome || { positive_notes: [], negative_notes: [] },
    sites,
  };
}

export { DAILY_REPORTS };
