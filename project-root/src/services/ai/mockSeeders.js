// project-root/src/services/ai/mockSeeders.js

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeded(seed = 123456) {
  const r = mulberry32(seed >>> 0);
  return {
    next: () => r(),
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
  };
}

export function seedMockWeather({ seed = 123456, hours = [6, 9, 12, 15, 18, 21] } = {}) {
  const rnd = seeded(seed);
  const rows = hours.map((h, i) => {
    const temp = 27 + rnd.int(-2, 4) + (h >= 12 && h <= 15 ? rnd.int(1, 3) : 0);
    const humidity = 55 + rnd.int(10, 35);
    const rain = Math.max(0, Math.min(100, rnd.int(5, 90) - (h >= 12 && h <= 15 ? 10 : 0)));
    const wind = rnd.int(0, 30);
    const uv = Math.max(0, Math.min(11, h >= 10 && h <= 14 ? rnd.int(5, 11) : rnd.int(0, 7)));
    const feelsLike = temp + rnd.int(2, 5);
    const status = rain > 70 ? 'ฝนฟ้าคะนอง' : rain > 40 ? 'ฝนตก' : uv > 8 ? 'แดดจัด' : 'เมฆเป็นส่วนมาก';
    // extended metrics
    const rainfall_mm = Math.max(0, Math.round((rain / 100) * rnd.int(0, 20)));
    const visibility = Math.max(2, 12 - Math.round(rain / 15) - rnd.int(0, 2));
    const pressure = 1000 + rnd.int(-8, 12) - Math.round(rain / 50); // 992–1012 approx
    const cloud_cover = Math.min(100, Math.max(0, Math.round((rain / 100) * 30 + (uv < 4 ? rnd.int(30, 70) : rnd.int(10, 40)) + rnd.int(-5, 5))));
    const dew_point = Math.round(temp - ((100 - humidity) / 5));
    return {
      time: `${String(h).padStart(2, '0')}:00`,
      condition: status,
      tempC: temp,
      humidity,
      rainProb: rain,
      wind_speed: wind,
      uv_index: uv,
      feels_like: feelsLike,
      rainfall_mm,
      visibility,
      pressure,
      cloud_cover,
      dew_point,
    };
  });
  return rows;
}

export function seedMockMaterials({ seed = 654321, count = 6 } = {}) {
  const rnd = seeded(seed);
  const pool = [
    { name: 'ยางมะตอย', code: 'ASPHALT' },
    { name: 'หิน', code: 'AGG' },
    { name: 'ทราย', code: 'SAND' },
    { name: 'น้ำมันเชื้อเพลิง', code: 'FUEL' },
    { name: 'ซีเมนต์', code: 'CEM' },
  ];
  const suppliers = ['Supplier A', 'Supplier B', 'Supplier C'];
  const grades = ['A', 'B', 'C'];
  const rows = Array.from({ length: count }).map(() => {
    const base = rnd.pick(pool);
    const qty = Number((rnd.int(5, 180) + rnd.next()).toFixed(2));
    const moisture = rnd.pick([undefined, Number((rnd.int(1, 10) + rnd.next()).toFixed(1))]);
    const storage = rnd.pick(['indoor', 'outdoor']);
    const days_left = rnd.int(3, 28);
    const unit_cost = rnd.int(600, 1800);
    const next_delivery = new Date(Date.now() + rnd.int(1, 14) * 86400000).toISOString().slice(0, 10);
    return {
      name: base.name,
      code: base.code,
      stockTons: qty,
      moisture,
      batch_no: `BATCH-${rnd.int(10000, 99999)}`,
      last_updated: new Date(Date.now() - rnd.int(0, 72) * 3600 * 1000).toISOString(),
      quality_grade: rnd.pick(grades),
      supplier: rnd.pick(suppliers),
      storage,
      days_left,
      unit_cost,
      total_value: Math.round(qty * unit_cost),
      next_delivery,
    };
  });
  return rows;
}

export default { seedMockWeather, seedMockMaterials };

// ---- Additional mock generators for rotation ----
export function seedMockTasks({ seed = 111111, count = 5 } = {}) {
  const rnd = seeded(seed);
  const priorities = ['low', 'medium', 'high'];
  const types = ['stock', 'quality', 'logistics', 'safety'];
  const actions = [
    ['ตรวจความชื้นวัสดุ', 'ความชื้นเกินเกณฑ์', 'อุ่นวัสดุก่อนมิก/ปู'],
    ['ติดตามการส่งของ', 'ขนส่งล่าช้า', 'ปรับตารางรับสินค้า'],
    ['เตรียมเครื่องจักร', 'รอบซ่อมบำรุงใกล้ถึง', 'กำหนดเวลาซ่อมบำรุง'],
    ['สั่งซื้อวัสดุเพิ่ม', 'สต็อกต่ำกว่า ROP', 'ออกใบ PR/PO'],
  ];
  return Array.from({ length: count }).map(() => {
    const [message, reason, suggest] = rnd.pick(actions);
    return {
      type: rnd.pick(types),
      priority: rnd.pick(priorities),
      message,
      reason,
      suggest,
    };
  });
}

export function seedMockChat({ seed = 222222, count = 8 } = {}) {
  const rnd = seeded(seed);
  const senders = ['site-foreman', 'driver', 'qc', 'warehouse', 'manager'];
  const texts = [
    'รถติดหน้าไซต์ ขอเลื่อนส่ง 30 นาที',
    'เริ่มมิกวัสดุแล้ว',
    'อากาศเริ่มมีฝนโปรย',
    'ภาพถ่ายพื้นที่ก่อนปูยาง',
    'จุด A พร้อมเทแล้ว',
    'ขอเติมน้ำมันเพิ่ม',
    'พรุ่งนี้มีงานเร่งด่วน',
  ];
  return Array.from({ length: count }).map(() => {
    const type = rnd.pick(['text', 'text', 'text', 'image']);
    const message = type === 'image' ? { type: 'image', url: 'https://picsum.photos/seed/' + rnd.int(1, 10000) + '/300/200' } : { type: 'text', text: rnd.pick(texts) };
    return {
      time: new Date(Date.now() - rnd.int(0, 6) * 3600 * 1000).toISOString(),
      from: rnd.pick(senders),
      message,
    };
  });
}

export function seedMockCdp({ seed = 333333 } = {}) {
  const rnd = seeded(seed);
  const summary = {
    dailyActive: rnd.int(40, 120),
    weeklyActive: rnd.int(180, 400),
    newUsers7d: rnd.int(8, 40),
    returning7d: rnd.int(30, 100),
    messages7d: rnd.int(800, 2400),
  };
  const segments = [
    { label: 'Power Users', users: rnd.int(8, 24) },
    { label: 'Returning', users: rnd.int(30, 120) },
    { label: 'New', users: rnd.int(8, 50) },
    { label: 'Dormant 30d', users: rnd.int(12, 46) },
  ];
  const predictive = [
    { type: 'churn-risk', message: `กลุ่ม Returning มีความเสี่ยงเพิ่มขึ้น ${rnd.int(5, 18)}% สัปดาห์นี้` },
    { type: 'campaign', message: 'เสนอแคมเปญต้อนรับสำหรับ New users → เพิ่มการกลับมาใช้ซ้ำ' },
  ];
  return { summary, segments, predictive };
}
