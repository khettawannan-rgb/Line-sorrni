#!/usr/bin/env bash
set -euo pipefail

echo "== Fix structure: start =="
# 1) หา root โปรเจกต์
if [[ ! -f "package.json" ]]; then
  echo "ไม่พบ package.json ในโฟลเดอร์ปัจจุบัน ลอง cd ไปยังโฟลเดอร์โปรเจกต์ก่อนนะครับ"
  exit 1
fi

# 2) สำรองก่อน
timestamp=$(date +%Y%m%d-%H%M%S)
mkdir -p _backup
echo "-> backup โครงสร้างเดิมไปที่ _backup/snapshot-$timestamp.tgz"
tar czf "_backup/snapshot-$timestamp.tgz" project-root src public jobs 2>/dev/null || true

# 3) ย้ายของออกจาก project-root/
if [[ -d "project-root/src" ]]; then
  echo "-> ย้าย project-root/src -> ./src"
  rm -rf src
  mv project-root/src ./src
fi
if [[ -d "project-root/public" ]]; then
  echo "-> ย้าย project-root/public -> ./public"
  rm -rf public
  mv project-root/public ./public
fi

# 4) jobs ที่ซ้ำ (เราจะใช้ src/jobs เป็นหลัก)
if [[ -d jobs && -d src/jobs ]]; then
  echo "-> พบ jobs ซ้ำสองที่ ลบ jobs (root) ทิ้ง"
  rm -rf jobs
elif [[ -d jobs && ! -d src/jobs ]]; then
  echo "-> ย้าย jobs (root) -> src/jobs"
  mkdir -p src
  mv jobs src/jobs
fi

# 5) ลบ project-root/ ที่ไม่ใช้แล้ว
rm -rf project-root || true

# 6) public subdirs + โลโก้
echo "-> สร้าง public/{css,js,img}"
mkdir -p public/css public/js public/img

# วางโลโก้ถ้าพบไฟล์
if [[ -f "Nila_Flatcolour_Logo.jpg" ]]; then
  cp -f Nila_Flatcolour_Logo.jpg public/img/nila-logo.jpg
elif [[ -f "Nila_Flatcolour_Logo.png" ]]; then
  cp -f Nila_Flatcolour_Logo.png public/img/nila-logo.png
fi

# 7) ไฟล์ UI พื้นฐาน (ถ้าไม่มีจะสร้างให้)
if [[ ! -f public/css/app.css ]]; then
  cat > public/css/app.css <<'CSS'
:root{--bg:#0b1220;--card:#0f172a;--muted:#94a3b8;--text:#e2e8f0;--primary:#4f46e5;--primary-2:#22d3ee}
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,#111827 0%,#0b1220 40%,#0b1220 100%);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial,'Noto Sans','Apple Color Emoji','Segoe UI Emoji';color:var(--text)}
a{color:#9ddcff;text-decoration:none}a:hover{text-decoration:underline}
.header{position:sticky;top:0;z-index:20;background:rgba(11,18,32,.7);backdrop-filter:blur(8px);border-bottom:1px solid rgba(148,163,184,.15)}
.navbar{max-width:1100px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:16px;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.3px}.brand img{height:28px;width:auto}
.navlinks{display:flex;gap:14px;font-size:14px}
.container{max-width:1100px;margin:28px auto;padding:0 20px}
.card{background:linear-gradient(180deg,rgba(17,24,39,.7) 0%,rgba(15,23,42,.6) 100%);border:1px solid rgba(148,163,184,.16);box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);border-radius:16px;padding:22px}
.grid{display:grid;gap:18px}.grid.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.section-title{font-size:22px;margin:0 0 12px;font-weight:700}.muted{color:var(--muted);font-size:14px}
.table{width:100%;border-collapse:separate;border-spacing:0 10px;font-size:14px}
.table th{color:#9fb3c8;font-weight:600;text-align:left;padding:0 10px 6px}
.table td{background:#0f172a;padding:14px 12px;border:1px solid rgba(148,163,184,.14)}
.table tr td:first-child{border-radius:10px 0 0 10px}
.table tr td:last-child{border-radius:0 10px 10px 0}
.btn{background:linear-gradient(90deg,var(--primary) 0%,var(--primary-2) 100%);color:#fff;border:none;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer}
.btn:disabled{opacity:.6;cursor:not-allowed}
CSS
fi

if [[ ! -f public/js/app.js ]]; then
  echo "console.log('[UI] loaded');" > public/js/app.js
fi

# 8) แจ้งสคริปต์ใน package.json (ไม่แก้ให้อัตโนมัติ แค่เตือนถ้าไม่มี)
if ! grep -q '"dev"' package.json 2>/dev/null; then
  echo "!! แนะนำเพิ่ม scripts.dev ลงใน package.json:"
  echo '   "dev": "nodemon --watch src --ext js,ejs --exec \"node src/app.js\""'
fi
if ! grep -q '"start"' package.json 2>/dev/null; then
  echo '!! แนะนำเพิ่ม scripts.start ลงใน package.json:'
  echo '   "start": "node src/app.js"'
fi

# 9) แสดงโครงสร้างผลลัพธ์
echo "== Final structure (top 3 levels) =="
if command -v tree >/dev/null 2>&1; then
  tree -L 3 -I "node_modules|_backup"
else
  find . -maxdepth 3 -print | sed 's|^\./||'
fi
echo "== Done =="
