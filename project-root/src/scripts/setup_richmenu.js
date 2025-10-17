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

  const BASE_URL = ((process.env.BASE_URL || 'https://example.com')).replace(/\/$/, '');

  const areas = [
    // แถวบน: รายงานวันนี้ / เลือกรายงาน / ล่าสุด
    { bounds: { x: x[0], y: y[0], width: colW[0], height: rowH[0] }, action: { type: 'message', text: 'สรุป วันนี้' }, label: 'รายงานวันนี้' },
    { bounds: { x: x[1], y: y[0], width: colW[1], height: rowH[0] }, action: { type: 'message', text: 'สรุป' },        label: 'เลือกรายงาน' },
    { bounds: { x: x[2], y: y[0], width: colW[2], height: rowH[0] }, action: { type: 'message', text: 'สถานะ' },       label: 'ล่าสุด' },
    // แถวล่าง: ตั้งค่า / เชื่อมต่อบริษัท / ติดต่อเรา
    { bounds: { x: x[0], y: y[1], width: colW[0], height: rowH[1] }, action: { type: 'uri', uri: `${BASE_URL}/liff-open-admin?to=/admin` }, label: 'ตั้งค่า' },
    { bounds: { x: x[1], y: y[1], width: colW[1], height: rowH[1] }, action: { type: 'uri', uri: `${BASE_URL}/auth/line/start?redirect=/admin` }, label: 'เชื่อมต่อบริษัท' },
    { bounds: { x: x[2], y: y[1], width: colW[2], height: rowH[1] }, action: { type: 'postback', data: 'CONTACT_US', displayText: 'ติดต่อเรา' }, label: 'ติดต่อเรา' },
  ];

  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'NILA_FULL_3x2',
    chatBarText: 'เมนู',
    areas: areas.map(a => ({ bounds: a.bounds, action: a.action })),
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
