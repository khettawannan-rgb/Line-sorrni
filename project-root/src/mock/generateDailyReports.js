// project-root/src/mock/generateDailyReports.js
// Deterministic generator for DailyReport datasets with S-curves and pos/neg outcomes

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeded(seed) {
  const r = mulberry32(seed >>> 0);
  return {
    next: () => r(),
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
  };
}

function buildSCurve(rnd, base = 60, spread = 15, makeOver = false, makeUnder = false) {
  const points = [];
  let plan = 0;
  let actual = 0;
  for (let d = 1; d <= 10; d++) {
    plan += rnd.int(6, 12); // cumulative progress
    actual += rnd.int(6, 12);
    points.push({ day: d, plan: Math.min(100, plan), actual: Math.min(100, actual) });
  }
  // normalize to approx base..base+spread for plan
  const scalePlan = (target) => {
    const factor = target / points[9].plan;
    points.forEach((p) => (p.plan = Math.max(0, Math.min(100, Math.round(p.plan * factor)))));
  };
  scalePlan(base + rnd.int(0, spread));

  const tweak = makeOver ? rnd.int(10, 20) : makeUnder ? -rnd.int(10, 20) : rnd.int(-8, 12);
  const factorActual = Math.max(0.6, Math.min(1.4, (points[9].plan + tweak) / Math.max(1, points[9].actual)));
  points.forEach((p) => (p.actual = Math.max(0, Math.min(100, Math.round(p.actual * factorActual)))));
  return points;
}

const ISSUE_POOL = ['ฝนตก', 'วัสดุขาด', 'รถเสีย', 'ติดตรวจรับ'];

export function generateMockDailyReports(count = 10, seed = 123456) {
  const rnd = seeded(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const siteCount = rnd.int(2, 4);
    const sites = [];
    let overPlaced = false;
    let underPlaced = false;
    for (let s = 0; s < siteCount; s++) {
      const site_plan_pct = rnd.int(58, 78);
      const forceOver = !overPlaced && s === 0; // ensure at least one over
      const forceUnder = !underPlaced && s === 1; // ensure at least one under
      const s_curve = buildSCurve(rnd, site_plan_pct, 12, forceOver, forceUnder);
      if (s_curve[9].actual > s_curve[9].plan) overPlaced = true;
      if (s_curve[9].actual < s_curve[9].plan) underPlaced = true;

      const taskN = rnd.int(2, 5);
      const tasks = [];
      for (let t = 0; t < taskN; t++) {
        const cat = rnd.pick(['งานยาง', 'ตรวจสอบ', 'อื่นๆ']);
        const qty = cat === 'งานยาง' ? rnd.int(100, 520) : rnd.int(2, 1200);
        const unit = cat === 'งานยาง' ? 'ตัน' : cat === 'ตรวจสอบ' ? 'จุด' : 'ตร.ม.';
        const startH = rnd.int(8, 11);
        const endH = rnd.int(14, 17);
        const prog = rnd.int(40, 100);
        const issueCount = rnd.int(0, 2);
        const issues = Array.from({ length: issueCount }).map(() => rnd.pick(ISSUE_POOL));
        const outcome = {
          delays: issues.includes('ฝนตก') ? rnd.int(10, 60) : rnd.int(0, 10),
          rework: issues.includes('ติดตรวจรับ') ? rnd.int(1, 3) : 0,
          quality_pass: prog >= 90 && !issues.includes('ติดตรวจรับ'),
          sentiment: issues.length ? 'negative' : prog >= 90 ? 'positive' : 'neutral',
        };
        tasks.push({
          category: cat,
          task_name: cat === 'งานยาง' ? rnd.pick(['Binder', 'Wearing', 'Prime coat', 'Tack coat']) : cat === 'ตรวจสอบ' ? rnd.pick(['Core test', 'Marshall Test', 'ตรวจ Deflection']) : rnd.pick(['ทำความสะอาดพื้นที่', 'ย้ายเครื่องจักร', 'ทำเส้นจราจร']),
          quantity: qty,
          unit,
          start: `${String(startH).padStart(2, '0')}:00`,
          end: `${String(endH).padStart(2, '0')}:00`,
          progress_pct: prog,
          issues,
          photos: rnd.int(0, 5),
          locations: rnd.int(0, 4),
          outcome,
        });
      }
      const neg = rnd.int(0, 1) === 1; // mark site negative sometimes
      const site_outcome = {
        delays: neg ? rnd.int(10, 60) : rnd.int(0, 10),
        rework: neg ? rnd.int(1, 3) : 0,
        quality_pass: !neg,
        sentiment: neg ? 'negative' : 'positive',
      };
      sites.push({
        site_id: `S-${rnd.int(100, 999)}`,
        site_name: rnd.pick(['สุขุมวิท ช่วง 38–40', 'บางนา–ตราด กม.35–37', 'ลาดกระบัง ช่วง 8–10', 'พหลโยธิน กม.95–97', 'พระราม 3 ช่วง 12–14']),
        province: rnd.pick(['กรุงเทพมหานคร', 'สมุทรปราการ', 'ชลบุรี', 'พระนครศรีอยุธยา', 'นนทบุรี']),
        lat: 13.6 + rnd.next() * 0.3,
        lng: 100.5 + rnd.next() * 0.3,
        site_plan_pct,
        s_curve,
        site_outcome,
        tasks,
      });
    }

    // portfolio
    const s_curve = Array.from({ length: 10 }).map((_, idx) => {
      const day = idx + 1;
      const planAvg = Math.round(sites.reduce((a, s) => a + (s.s_curve[idx]?.plan || 0), 0) / sites.length);
      const actAvg = Math.round(sites.reduce((a, s) => a + (s.s_curve[idx]?.actual || 0), 0) / sites.length);
      return { day, plan: planAvg, actual: actAvg };
    });

    const positive_notes = ['บางไซต์ทำได้เกินแผน', 'งานตรวจรับผ่าน 100%', 'ความคืบหน้าเกินค่าเฉลี่ย'];
    const negative_notes = ['ฝนทำให้ดีเลย์บางช่วง', 'วัสดุขาดบางรายการ', 'เครื่องจักรขัดข้อง'];

    out.push({
      date: `2025-10-${String(17 + i).padStart(2, '0')}`,
      portfolio_plan_pct: 60 + rnd.int(0, 15),
      s_curve,
      portfolio_outcome: {
        positive_notes: [positive_notes[rnd.int(0, positive_notes.length - 1)]],
        negative_notes: [negative_notes[rnd.int(0, negative_notes.length - 1)]],
      },
      sites,
    });
  }
  return out;
}

export default generateMockDailyReports;

