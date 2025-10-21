// project-root/src/services/reportImages.js
import fs from 'node:fs';
import path from 'node:path';

function resolveImgDir() {
  const candidates = [
    path.resolve('project-root/public/img-report'),
    path.resolve('public/img-report'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch {}
  }
  return null;
}

export function loadImagePool() {
  const dir = resolveImgDir();
  const pool = { all: [], road: [], bridge: [], clear: [], misc: [] };
  if (!dir) return pool;
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
  const classify = (name) => {
    const n = name.toLowerCase();
    if (/(road|ถนน|asphalt|ยาง)/i.test(n)) return 'road';
    if (/(bridge|สะพาน)/i.test(n)) return 'bridge';
    if (/(clear|clearing|เคลียร์|รื้อ|ปรับพื้นที่)/i.test(n)) return 'clear';
    return 'misc';
  };
  for (const f of files) {
    const cat = classify(f);
    pool.all.push(f);
    pool[cat].push(f);
  }
  return pool;
}

function abs(baseUrl, relPath) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return base ? `${base}${relPath}` : relPath;
}

export function chooseImagesForSummary(summary, pool, { baseUrl = '', perOverview = 3, perSite = 3 } = {}) {
  const wrap = (fname) => abs(baseUrl, `/static/img-report/${encodeURIComponent(fname)}`);
  const pickRandom = (arr, n) => {
    const out = [];
    const copy = [...arr];
    for (let i = 0; i < n && copy.length; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  };

  const overviewCandidates = pool.all.length ? pool.all : [];
  const overviewImages = pickRandom(overviewCandidates, perOverview).map(wrap);

  const siteImages = {};
  for (const s of summary.sites || []) {
    const preferRoad = /🛣️|ยาง|asphalt|road/i.test(String(s.key_line || ''));
    const category = preferRoad ? 'road' : (pool.bridge.length ? 'bridge' : (pool.misc.length ? 'misc' : 'all'));
    const srcArr = pool[category] && pool[category].length ? pool[category] : pool.all;
    siteImages[s.site_id] = pickRandom(srcArr, perSite).map(wrap);
  }

  return { overviewImages, siteImages };
}

export default { loadImagePool, chooseImagesForSummary };
