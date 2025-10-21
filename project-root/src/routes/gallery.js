// project-root/src/routes/gallery.js
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

function listImages() {
  const dirs = [path.resolve('project-root/public/img-report'), path.resolve('public/img-report')];
  let dir = null;
  for (const d of dirs) {
    try { if (fs.existsSync(d) && fs.statSync(d).isDirectory()) { dir = d; break; } } catch {}
  }
  if (!dir) return [];
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
  return files.map((f) => ({ name: f, url: `/static/img-report/${encodeURIComponent(f)}` }));
}

router.get('/gallery/photos', (req, res) => {
  const items = listImages();
  const title = 'รูปภาพรายงาน (Mock)';
  res.set('Cache-Control', 'no-store');
  res.send(`<!doctype html>
  <html lang="th"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#0b1220;color:#e2e8f0}
      header{position:sticky;top:0;background:#0f172a;padding:12px 16px;border-bottom:1px solid #1f2937}
      h1{font-size:1.1rem;margin:0}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:12px}
      @media(min-width:480px){.grid{grid-template-columns:repeat(3,1fr)}}
      @media(min-width:720px){.grid{grid-template-columns:repeat(4,1fr)}}
      .card{border-radius:10px;overflow:hidden;background:#0b1220;border:1px solid #1f2937}
      img{width:100%;height:180px;object-fit:cover;display:block}
      .name{font-size:.75rem;color:#94a3b8;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .empty{padding:24px;text-align:center;color:#94a3b8}
      a {color:#93c5fd}
    </style>
  </head><body>
    <header><h1>${title}</h1></header>
    <main>
      ${items.length ? `<section class="grid">${items.map(it => `<div class="card"><img loading="lazy" src="${it.url}" alt="${it.name}" /><div class="name">${it.name}</div></div>`).join('')}</section>` : `<p class="empty">ยังไม่มีรูปในโฟลเดอร์ <code>public/img-report</code></p>`}
    </main>
  </body></html>`);
});

export default router;

