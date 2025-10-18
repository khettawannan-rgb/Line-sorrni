// project-root/src/services/procurement/poMock.js

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

const VENDORS = ['Supplier A', 'Supplier B', 'Supplier C', 'Tipco', 'PTT'];
const STATUSES = ['pending', 'approved', 'ordered', 'shipped', 'delivered', 'cancelled'];

export function buildMockPOs(count = 8, seed = Date.now() % 2147483647) {
  const rnd = seeded(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const status = rnd.pick(STATUSES);
    const total = rnd.int(12000, 120000);
    out.push({
      po_no: `PO-${2025}${String(rnd.int(1, 9999)).padStart(4, '0')}`,
      vendor: rnd.pick(VENDORS),
      item_count: rnd.int(1, 6),
      total_thb: total,
      status,
      updated_at: new Date(Date.now() - rnd.int(0, 6) * 3600 * 1000).toISOString(),
    });
  }
  // Ensure variety include at least one shipped/delivered/pending
  if (!out.some((p) => p.status === 'pending')) out[0].status = 'pending';
  if (!out.some((p) => p.status === 'delivered')) out[1 % out.length].status = 'delivered';
  if (!out.some((p) => p.status === 'shipped')) out[2 % out.length].status = 'shipped';
  return out;
}

export default { buildMockPOs };

