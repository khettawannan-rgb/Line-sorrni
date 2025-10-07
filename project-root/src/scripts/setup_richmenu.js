// scripts/setup_richmenu.js
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createRichMenu,
  uploadRichMenuImage,
  setDefaultRichMenu,
  getRichMenuList,
  deleteRichMenu,
} from '../services/line.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_PATH = path.join(__dirname, '..', 'assets', 'richmenu.jpg');

// ขนาดเต็ม (full) 2500x1686 ตาม spec, แบ่ง 3x2 = 6 ปุ่ม
function buildMenuConfigFull() {
  const colW = [834, 833, 833];  // 834+833+833 = 2500
  const rowH = [843, 843];       // 843+843 = 1686
  const x = [0, colW[0], colW[0] + colW[1]];
  const y = [0, rowH[0]];

  const areas = [
    { bounds: { x: x[0], y: y[0], width: colW[0], height: rowH[0] }, data: 'SUMMARY_TODAY',  label: 'รายงานวันนี้' },
    { bounds: { x: x[1], y: y[0], width: colW[1], height: rowH[0] }, data: 'SUMMARY_PICK',   label: 'เลือกรายงาน' },
    { bounds: { x: x[2], y: y[0], width: colW[2], height: rowH[0] }, data: 'LATEST_RECORDS', label: 'รายการล่าสุด' },
    { bounds: { x: x[0], y: y[1], width: colW[0], height: rowH[1] }, data: 'HELP',           label: 'ช่วยเหลือ' },
    { bounds: { x: x[1], y: y[1], width: colW[1], height: rowH[1] }, data: 'LINK_COMPANY',   label: 'ผูกบริษัท' },
    { bounds: { x: x[2], y: y[1], width: colW[2], height: rowH[1] }, data: 'PREFS',          label: 'ตั้งค่ารับแจ้ง' },
  ];

  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'NILA_FULL_3x2',
    chatBarText: 'เมนู',
    areas: areas.map(a => ({
      bounds: a.bounds,
      action: { type: 'postback', data: a.data, displayText: a.label },
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('ERROR: ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อน');
    process.exit(1);
  }

  if (args.includes('--list')) {
    const list = await getRichMenuList();
    console.log('Rich menus:', list);
    process.exit(0);
  }

  if (args.includes('--nuke')) {
    const list = await getRichMenuList();
    for (const m of list) {
      console.log('Deleting', m.richMenuId, m.name);
      await deleteRichMenu(m.richMenuId);
    }
    console.log('Done nuke.');
    process.exit(0);
  }

  // สร้างใหม่
  const menuCfg = buildMenuConfigFull();
  console.log('[RICHMENU] creating ...');
  const id = await createRichMenu(menuCfg);
  console.log('[RICHMENU] created id =', id);

  console.log('[RICHMENU] uploading image ...', IMAGE_PATH);
  await uploadRichMenuImage(id, IMAGE_PATH);

  console.log('[RICHMENU] set default ...');
  await setDefaultRichMenu(id);

  console.log('✅ DONE. Default rich menu id:', id);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
