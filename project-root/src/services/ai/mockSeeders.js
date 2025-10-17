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
    return {
      time: `${String(h).padStart(2, '0')}:00`,
      condition: status,
      tempC: temp,
      humidity,
      rainProb: rain,
      wind_speed: wind,
      uv_index: uv,
      feels_like: feelsLike,
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
    return {
      name: base.name,
      code: base.code,
      stockTons: qty,
      moisture,
      batch_no: `BATCH-${rnd.int(10000, 99999)}`,
      last_updated: new Date(Date.now() - rnd.int(0, 72) * 3600 * 1000).toISOString(),
      quality_grade: rnd.pick(grades),
      supplier: rnd.pick(suppliers),
    };
  });
  return rows;
}

export default { seedMockWeather, seedMockMaterials };

