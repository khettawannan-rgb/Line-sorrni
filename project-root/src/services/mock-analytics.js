// project-root/src/services/mock-analytics.js
// Deterministic mock analytics seeder + adapters for Engagement & Behaviour

/**
 * Helper: seeded PRNG (mulberry32)
 */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed) {
  const rand = mulberry32(seed >>> 0);
  return {
    next: () => rand(),
    int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    weightedPick: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = rand() * total;
      for (const [v, w] of pairs) {
        if ((r -= w) <= 0) return v;
      }
      return pairs[0][0];
    },
    normal: (mean = 0, std = 1) => {
      // Box–Muller
      const u = 1 - rand();
      const v = 1 - rand();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return z * std + mean;
    },
  };
}

function dateRange(fromIso, toIso) {
  const out = [];
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const cur = new Date(from);
  while (cur <= to) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function toISODate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Exported types (JSDoc only)
/** @typedef {{ seed:number, from:string, to:string, groups?:string[], sites?:string[], segments?:string[] }} SeedOpts */

/**
 * Seed deterministic mock CDP dataset.
 * @param {SeedOpts} opts
 */
export function seedMockAnalytics(opts) {
  const seed = Number(opts?.seed ?? 12345) >>> 0;
  const rnd = seededRandom(seed);
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 56);
  const from = new Date(opts?.from || toISODate(defaultFrom));
  const to = new Date(opts?.to || toISODate(today));

  const groups = Array.isArray(opts?.groups) && opts.groups.length
    ? opts.groups
    : ['g_ops_a', 'g_ops_b', 'g_ops_c'];
  const sites = Array.isArray(opts?.sites) && opts.sites.length
    ? opts.sites
    : ['S01', 'S02', 'S03', 'S04'];
  const segments = Array.isArray(opts?.segments) && opts.segments.length
    ? opts.segments
    : ['large_contractor', 'regional_contractor', 'sme_contractor'];

  const roles = ['owner', 'foreman', 'accounting'];
  const intents = ['weather', 'material', 'invoice', 'task', 'safety'];
  const topics = ['asphalt_laying', 'mix_design', 'delivery', 'payment'];
  const messageTypes = ['text', 'image', 'location', 'action'];
  const weatherPool = ['clear', 'cloudy', 'rain'];

  // Build users deterministically
  const userCount = 240 + rnd.int(0, 120);
  const users = Array.from({ length: userCount }).map((_, i) => {
    const user_id = `u_${(i + 1).toString().padStart(4, '0')}`;
    const firstOffset = rnd.int(0, 42);
    const firstSeen = new Date(from);
    firstSeen.setUTCDate(firstSeen.getUTCDate() + firstOffset);
    return {
      user_id,
      first_seen: toISODate(firstSeen),
      segment: rnd.pick(segments),
      role: rnd.pick(roles),
      group_id: rnd.pick(groups),
    };
  });

  const days = dateRange(toISODate(from), toISODate(to));

  // Events generation
  const events = [];
  const locCenter = { lat: 13.736717, lng: 100.523186 };
  for (const day of days) {
    const isoDate = toISODate(day);
    const dow = day.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const weather = rnd.weightedPick([
      ['clear', 6],
      ['cloudy', 3],
      ['rain', isWeekend ? 2 : 3],
    ]);

    // Base activity factor per day
    const baseActivity = isWeekend ? 0.4 : 1.0;
    const dailyVolume = Math.max(10, Math.round((180 + rnd.int(-40, 80)) * baseActivity));

    for (let j = 0; j < dailyVolume; j++) {
      const u = rnd.pick(users);
      // only generate events after user first_seen
      if (isoDate < u.first_seen) continue;
      const hour = rnd.weightedPick([
        [8, 2], [9, 3], [10, 4], [11, 3], [12, 1], [13, 2], [14, 3], [15, 4], [16, 4], [17, 3], [18, 2], [19, 1],
      ]);
      const minute = rnd.int(0, 59);
      const ts = new Date(`${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
      const intent = rnd.weightedPick(intents.map((k) => [k, 1]));
      const topic = rnd.weightedPick(topics.map((k) => [k, 1]));
      const message_type = rnd.weightedPick([
        ['text', 70],
        ['image', 18],
        ['location', 7],
        ['action', 5],
      ]);
      const sentiment = clamp01(0.55 + rnd.normal(0, 0.22) + (intent === 'invoice' ? -0.05 : 0) + (intent === 'task' ? 0.04 : 0));
      const response_time_ms = Math.max(500, Math.round(Math.exp(rnd.normal(Math.log(20_000), 0.7))));
      const action_taken = message_type === 'action' ? rnd.next() < 0.65 : rnd.next() < 0.15;
      const csat_mock = Math.max(1, Math.min(5, Math.round(1 + sentiment * 4 + (action_taken ? 0.4 : -0.2) + rnd.normal(0, 0.4))));
      const lat = locCenter.lat + rnd.normal(0, 0.08);
      const lng = locCenter.lng + rnd.normal(0, 0.08);

      events.push({
        ts: ts.toISOString(),
        user_id: u.user_id,
        group_id: u.group_id,
        role: u.role,
        message_type,
        intent,
        topic,
        sentiment: Number(sentiment.toFixed(3)),
        response_time_ms,
        action_taken,
        csat_mock,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        weather,
      });
    }
  }

  // Outcomes per site/day
  const outcomes = [];
  for (const day of days) {
    const iso = toISODate(day);
    for (const site of sites) {
      const tasks = Math.max(5, 14 + seededRandom(seed ^ (site.length * 31 + day.getUTCDate())).int(-3, 6));
      const delays = Math.max(0, Math.round((tasks * 0.08) + seededRandom(seed ^ site.length).int(-1, 2)));
      const rework = Math.max(0, Math.round((tasks * 0.03) + seededRandom(seed ^ 77).int(-1, 1)));
      outcomes.push({ site_id: site, date: iso, tasks_done: tasks, delays, rework });
    }
  }

  // AB flags
  const ab_flags = users.map((u) => ({ user_id: u.user_id, advice_type: 'weather_advice', treatment: rnd.next() < 0.5 }));

  return { seed, from: toISODate(from), to: toISODate(to), users, events, outcomes, ab_flags };
}

// ---------- Metric processors (pure) ----------

export function calcStickiness(dailyActive, monthlyActive) {
  const dau = Number(dailyActive || 0);
  const mau = Number(monthlyActive || 1);
  return dau / mau;
}

export function calcSentimentNet(events) {
  const pos = events.filter((e) => e.sentiment > 0.6).length;
  const neg = events.filter((e) => e.sentiment < 0.4).length;
  const total = Math.max(1, pos + neg);
  return (pos / total) - (neg / total);
}

export function calcFollowThrough(events) {
  const shown = events.length; // using all events as exposure proxy
  const acted = events.filter((e) => !!e.action_taken).length;
  return shown ? acted / shown : 0;
}

export function calcPercentiles(values, p) {
  const arr = [...values].sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

export function calcCohortRetention(users, events, weeks = 6) {
  // cohort by first_seen week
  const weekOf = (iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const week = Math.floor((d.getUTCDate() - d.getUTCDay() + 7) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  };
  const cohorts = {};
  for (const u of users) {
    const w = weekOf(u.first_seen);
    cohorts[w] = cohorts[w] || { users: new Set(), weeks: Array.from({ length: weeks }).map(() => new Set()) };
    cohorts[w].users.add(u.user_id);
  }
  for (const e of events) {
    const u = users.find((x) => x.user_id === e.user_id);
    if (!u) continue;
    const start = new Date(u.first_seen + 'T00:00:00Z');
    const cur = new Date(e.ts);
    const diffDays = Math.floor((cur - start) / (1000 * 60 * 60 * 24));
    const offset = Math.floor(diffDays / 7);
    const w = weekOf(u.first_seen);
    const record = cohorts[w];
    if (record && offset >= 0 && offset < weeks) {
      record.weeks[offset].add(u.user_id);
    }
  }
  const rows = [];
  for (const [label, rec] of Object.entries(cohorts)) {
    const size = Math.max(1, rec.users.size);
    rec.weeks.forEach((set, idx) => {
      rows.push({ cohort: label, weekOffset: idx, rate: set.size / size });
    });
  }
  return rows;
}

export function calcUplift(ab_flags, events) {
  const index = new Map(ab_flags.map((f) => [f.user_id, !!f.treatment]));
  let tSum = 0, tCount = 0, cSum = 0, cCount = 0;
  events.forEach((e) => {
    const isT = index.get(e.user_id);
    if (isT) { tSum += e.action_taken ? 1 : 0; tCount += 1; } else { cSum += e.action_taken ? 1 : 0; cCount += 1; }
  });
  const t = tCount ? tSum / tCount : 0;
  const c = cCount ? cSum / cCount : 0.0001;
  return (t - c) / c;
}

export function detectAnomalies(series) {
  // series: [{ date, value }]
  const values = series.map((r) => r.value);
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length));
  return series.map((r) => ({ ...r, z: std ? (r.value - mean) / std : 0, anomaly: std && Math.abs((r.value - mean) / std) > 3 }));
}

export function calcRFM(events, users, asOfIso) {
  const asOf = new Date(asOfIso || new Date().toISOString());
  const byUser = new Map();
  events.forEach((e) => {
    const arr = byUser.get(e.user_id) || [];
    arr.push(e);
    byUser.set(e.user_id, arr);
  });
  const rows = [];
  for (const u of users) {
    const ev = (byUser.get(u.user_id) || []).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const last = ev.length ? new Date(ev[ev.length - 1].ts) : null;
    const daysSince = last ? Math.floor((asOf - last) / (1000 * 60 * 60 * 24)) : 999;
    const freq = ev.length;
    const value = ev.reduce((s, e) => s + (e.intent === 'invoice' ? 2 : e.intent === 'task' ? 1.4 : 1), 0);
    rows.push({ user_id: u.user_id, R: daysSince, F: freq, M: Number(value.toFixed(2)) });
  }
  return rows;
}

// ---------- Adapters (MOCK_CDP -> card props) ----------

export function buildIntentTrend(data) {
  // returns weekly stacked series per intent
  const events = data.events || [];
  const toWeek = (isoTs) => {
    const d = new Date(isoTs);
    const y = d.getUTCFullYear();
    const week = Math.floor((d.getUTCDate() - d.getUTCDay() + 7) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  };
  const map = new Map();
  events.forEach((e) => {
    const week = toWeek(e.ts);
    const key = `${week}::${e.intent}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([k, count]) => {
    const [week, intent] = k.split('::');
    return { week, category: intent, count };
  });
}

export function buildFunnel(data) {
  // Conversation funnel mapping to existing funnel card stages
  // We’ll approximate: Inquiry→Quote→PurchaseOrder→Payment→Delivered
  const events = data.events || [];
  const stages = {
    Inquiry: events.length,
    Quote: Math.round(events.length * 0.65),
    PurchaseOrder: Math.round(events.length * 0.42),
    Payment: Math.round(events.length * 0.33),
    Delivered: Math.round(events.length * 0.27),
  };
  return Object.entries(stages).map(([stage, count]) => ({ stage, count }));
}

export function buildCohortHeatmap(data) {
  return calcCohortRetention(data.users || [], data.events || [], 8);
}

export function buildSentimentTrend(data) {
  // Aggregate for donut chart + top keywords
  const events = data.events || [];
  const rows = [
    { positive: events.filter((e) => e.sentiment > 0.6).length, neutral: events.filter((e) => e.sentiment >= 0.4 && e.sentiment <= 0.6).length, negative: events.filter((e) => e.sentiment < 0.4).length },
  ];
  // keywords by topic (lightweight)
  const byTopic = new Map();
  events.forEach((e) => byTopic.set(e.topic, (byTopic.get(e.topic) || 0) + (e.sentiment > 0.5 ? 1 : 0)));
  const top = Array.from(byTopic.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
  return { series: rows, topKeywords: top };
}

export function buildSlaVsCsat(data) {
  const events = data.events || [];
  const byRole = new Map();
  events.forEach((e) => {
    const key = e.role || 'unknown';
    const arr = byRole.get(key) || [];
    arr.push(e);
    byRole.set(key, arr);
  });
  const rows = [];
  for (const [role, arr] of byRole.entries()) {
    const rt = arr.map((e) => Number(e.response_time_ms || 0));
    const avg = rt.reduce((s, v) => s + v, 0) / Math.max(1, rt.length);
    const median = calcPercentiles(rt, 0.5);
    const p90 = calcPercentiles(rt, 0.9);
    const sla = rt.length ? rt.filter((ms) => ms <= 60_000).length / rt.length : 0; // within 60s
    const csat = arr.reduce((s, e) => s + Number(e.csat_mock || 0), 0) / Math.max(1, arr.length);
    rows.push({ name: role, avgFirstReplySec: avg / 1000, medianFirstReplySec: median / 1000, p90FirstReplySec: p90 / 1000, slaPct: sla, csat });
  }
  return rows.sort((a, b) => a.medianFirstReplySec - b.medianFirstReplySec);
}

export function buildMediaLocationMix(data) {
  const typeCount = {};
  (data.events || []).forEach((e) => {
    typeCount[e.message_type] = (typeCount[e.message_type] || 0) + 1;
  });
  return Object.entries(typeCount).map(([label, count]) => ({ label, count }));
}

export function buildHourHeatmap(data) {
  const map = new Map();
  (data.events || []).forEach((e) => {
    const d = new Date(e.ts);
    const dow = d.getUTCDay();
    const hour = d.getUTCHours();
    const key = `${dow}:${hour}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([k, volume]) => {
    const [dow, hour] = k.split(':').map(Number);
    return { dow, hour, volume };
  });
}

export function buildSegmentBreakdown(data) {
  const events = data.events || [];
  const toWeek = (isoTs) => {
    const d = new Date(isoTs);
    const y = d.getUTCFullYear();
    const week = Math.floor((d.getUTCDate() - d.getUTCDay() + 7) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  };
  const usersIndex = new Map((data.users || []).map((u) => [u.user_id, u.segment || 'unknown']));
  const map = new Map();
  events.forEach((e) => {
    const week = toWeek(e.ts);
    const seg = usersIndex.get(e.user_id) || 'unknown';
    const key = `${week}::${seg}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([k, count]) => {
    const [week, category] = k.split('::');
    return { week, category, count };
  });
}

export function buildUpliftAB(data) {
  const uplift = calcUplift(data.ab_flags || [], data.events || []);
  return [{ label: 'Treatment vs Control', uplift }];
}

export function buildWeatherImpact(data) {
  const byWeather = new Map();
  (data.events || []).forEach((e) => {
    const arr = byWeather.get(e.weather) || [];
    arr.push(e);
    byWeather.set(e.weather, arr);
  });
  const rows = [];
  for (const [weather, arr] of byWeather.entries()) {
    rows.push({ weather, volume: arr.length, actions: arr.filter((e) => e.action_taken).length });
  }
  return rows;
}

export function buildAnomalySeries(data) {
  const byDay = new Map();
  (data.events || []).forEach((e) => {
    const iso = e.ts.slice(0, 10);
    const inc = (e.intent === 'invoice') || (e.topic === 'payment') ? 1 : 0;
    byDay.set(iso, (byDay.get(iso) || 0) + inc);
  });
  const series = Array.from(byDay.entries()).map(([date, value]) => ({ date, value }));
  return detectAnomalies(series);
}

export function buildRfmQuadrant(data) {
  const rows = calcRFM(data.events || [], data.users || [], data.to || new Date().toISOString());
  // Normalize to 0..1 for plotting convenience
  const maxR = rows.reduce((m, r) => Math.max(m, r.R), 1);
  const maxF = rows.reduce((m, r) => Math.max(m, r.F), 1);
  const maxM = rows.reduce((m, r) => Math.max(m, r.M), 1);
  return rows.map((r) => ({ user_id: r.user_id, x: 1 - r.R / maxR, y: r.F / maxF, size: r.M / maxM }));
}

// Node/Browser bridge: optional global assignment for browser if used standalone
if (typeof window !== 'undefined') {
  // expose seed function only (adapters are imported on server to shape data)
  window.__seedMockAnalytics = seedMockAnalytics;
}

export default {
  seedMockAnalytics,
  buildIntentTrend,
  buildFunnel,
  buildCohortHeatmap,
  buildSentimentTrend,
  buildSlaVsCsat,
  buildMediaLocationMix,
  buildHourHeatmap,
  buildSegmentBreakdown,
  buildUpliftAB,
  buildWeatherImpact,
  buildAnomalySeries,
  buildRfmQuadrant,
  calcStickiness,
  calcSentimentNet,
  calcFollowThrough,
  calcPercentiles,
};

