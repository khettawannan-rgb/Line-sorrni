// project-root/src/services/mock/menuMock.js
import { buildMockPOs } from '../../services/procurement/poMock.js';
import { buildPoStatusFlex } from '../../flex/poStatus.js';

function mulberry32(a) { return function () { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seeded(seed) { const r = mulberry32(seed >>> 0); return { next: () => r(), int: (min, max) => Math.floor(r() * (max - min + 1)) + min, pick: (arr) => arr[Math.floor(r() * arr.length)], }; }

export function buildPoStatusMockFlex(seed = Date.now()) {
  const list = buildMockPOs(10, 100000 + (seed % 1000000));
  return buildPoStatusFlex(list);
}

export function buildIoSummaryListFlex(type = 'today', seed = Date.now()) {
  const rnd = seeded(200000 + (seed % 1000000));
  const titleMap = { today: 'สรุปวันนี้ (Mock)', yesterday: 'สรุปเมื่อวาน (Mock)', week: 'สรุปสัปดาห์นี้ (Mock)', month: 'สรุปเดือนนี้ (Mock)' };
  const title = titleMap[type] || 'สรุปรายงาน (Mock)';
  const bubbles = [];
  const header = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [ { type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg' }, { type: 'text', text: 'รวม 10 รายการ', size: 'sm', color: '#64748b' } ] } };
  bubbles.push(header);
  for (let i = 0; i < 10; i++) {
    const in1 = rnd.int(80, 320); // tons
    const in2 = rnd.int(80, 320);
    const out = rnd.int(200, 900);
    const proj = rnd.pick(['ขยายช่องจราจร ทล.12 สุพรรณบุรี', 'ซ่อมปรับปรุงผิวทาง ทล.33 ปราจีนบุรี', 'งานก่อสร้างสะพานข้ามแยก', 'โครงการปรับปรุงไหล่ทาง']);
    const loc1 = rnd.pick(['ทล.311', 'ทล.1 (พหลโยธิน)', 'กทม. 3027', 'ทล.34 บางนา-ตราด']);
    const loc2 = rnd.pick(['ตอน บ้านม้า – ชัยนาท', 'ช่วง กม.35–37', 'ตอน บางนา – บางปู', 'ตอน บางบัวทอง – ปทุมธานี']);
    const span = `${rnd.int(1, 4)}.${rnd.int(100, 999)} กม. / ${rnd.int(12000, 45000).toLocaleString('th-TH')} ตร.ม.`;
    bubbles.push({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: [
        { type: 'text', text: `#${i + 1} ทดสอบบอทรายงานประจำวัน`, size: 'sm', color: '#0f172a', weight: 'bold' },
        { type: 'text', text: '📥 ขาเข้า (วัตถุดิบ)', size: 'sm', color: '#64748b' },
        { type: 'text', text: `🪨 หิน/วัสดุ A : ${in1.toLocaleString('th-TH')} ตัน`, size: 'sm' },
        { type: 'text', text: `🌫️ วัสดุ B : ${in2.toLocaleString('th-TH')} ตัน`, size: 'sm' },
        { type: 'text', text: `รวมขาเข้า : ${(in1 + in2).toLocaleString('th-TH')} ตัน`, size: 'sm', weight: 'bold' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: '📤 ขาออก', size: 'sm', color: '#64748b' },
        { type: 'text', text: `🛣️ แอสฟัลต์ติกคอนกรีต : ${out.toLocaleString('th-TH')} ตัน`, size: 'sm' },
        { type: 'separator', margin: 'md' },
        { type: 'text', text: `➡️ โครงการ: ${proj}`, size: 'sm', wrap: true },
        { type: 'text', text: `📍 สถานที่: ${loc1}`, size: 'sm' },
        { type: 'text', text: loc2, size: 'xs', color: '#64748b' },
        { type: 'text', text: `📏 ${span}`, size: 'xs', color: '#64748b' },
      ] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        { type: 'button', style: 'primary', action: { type: 'uri', label: 'ดูเพิ่ม', uri: process.env.IO_MORE_URL || 'https://app.nilasolutions.co' } },
      ] } });
  }
  return { type: 'flex', altText: title, contents: { type: 'carousel', contents: bubbles } };
}

export default { buildPoStatusMockFlex, buildIoSummaryListFlex };

