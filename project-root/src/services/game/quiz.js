// project-root/src/services/game/quiz.js
// Lightweight in-chat quiz: 5 questions per game, win if >= 4 correct
// In-memory state (sufficient for mock/POC). For production, swap to Redis/DB.

import { replyQuickMenu, replyText } from '../../services/line.js';

// ----- Question bank -------------------------------------------------------
// Format: { id, q, choices: {A,B,C,D}, answer: 'A'|'B'|'C'|'D', category }
const roads = [
  { id: 'r1',  q: 'ถนนที่ใช้ยางมะตอยเรียกว่าอะไร?', choices: { A: 'ถนนหิน', B: 'ถนนแอสฟัลต์', C: 'ถนนทราย', D: 'ถนนลูกรัง' }, answer: 'B', category: 'ถนน' },
  { id: 'r2',  q: 'เวลาทำถนนใหม่ เรามักใช้เครื่องจักรชนิดไหนในการปูแอสฟัลต์?', choices: { A: 'รถขุด', B: 'รถบด', C: 'รถปูแอสฟัลต์ (Paver)', D: 'รถบรรทุกน้ำ' }, answer: 'C', category: 'ถนน' },
  { id: 'r3',  q: 'ทำไมต้องบดอัดพื้นดินก่อนปูถนน?', choices: { A: 'เพื่อให้ดูเรียบ', B: 'เพื่อให้ถนนไม่ทรุด', C: 'เพื่อให้สวยงาม', D: 'เพื่อถ่ายรูปลงเพจ' }, answer: 'B', category: 'ถนน' },
  { id: 'r4',  q: 'ถนนลื่นตอนฝนตกเพราะอะไร?', choices: { A: 'น้ำมัน', B: 'ฝุ่นกับน้ำ', C: 'แอสฟัลต์ละลาย', D: 'รถเยอะเกิน' }, answer: 'B', category: 'ถนน' },
  { id: 'r5',  q: '“รอยแตกบนถนน” มักเกิดจากอะไร?', choices: { A: 'รถชนกัน', B: 'ความร้อนและน้ำ', C: 'ฝุ่นมากไป', D: 'ไม่มีใครขับ' }, answer: 'B', category: 'ถนน' },
  { id: 'r6',  q: 'ชั้นบนสุดของถนนที่เราเห็นเรียกว่าอะไร?', choices: { A: 'Subgrade', B: 'Base Course', C: 'Surface Course', D: 'Hard Layer' }, answer: 'C', category: 'ถนน' },
  { id: 'r7',  q: 'ยางมะตอยทำจากอะไรเป็นหลัก?', choices: { A: 'ดินเหนียว', B: 'หินปูน', C: 'ปิโตรเลียม', D: 'ทราย' }, answer: 'C', category: 'ถนน' },
  { id: 'r8',  q: 'ถ้าปูถนนตอนฝนตกจะเกิดอะไรขึ้น?', choices: { A: 'ถนนจะลื่น', B: 'แอสฟัลต์ไม่เกาะดี', C: 'สีไม่สวย', D: 'รถติด' }, answer: 'B', category: 'ถนน' },
  { id: 'r9',  q: '“Hot Mix Asphalt” หมายถึงอะไร?', choices: { A: 'แอสฟัลต์ร้อน', B: 'น้ำยาล้างรถ', C: 'ชื่อร้านกาแฟ', D: 'เพลงแนวร็อก' }, answer: 'A', category: 'ถนน' },
  { id: 'r10', q: 'รถบดใช้ทำอะไรในงานถนน?', choices: { A: 'ขุดดิน', B: 'ปรับพื้น', C: 'บดให้แน่น', D: 'ตักหิน' }, answer: 'C', category: 'ถนน' },
  { id: 'r11', q: 'ถ้าไม่ทำทางระบายน้ำดี ถนนจะเป็นอย่างไร?', choices: { A: 'รถวิ่งเร็วขึ้น', B: 'มีน้ำขังและพังไว', C: 'สวยขึ้น', D: 'เย็นขึ้น' }, answer: 'B', category: 'ถนน' },
  { id: 'r12', q: 'รอยร่องที่ล้อรถทิ้งไว้บนถนนเรียกว่าอะไร?', choices: { A: 'Groove', B: 'Rut', C: 'Crack', D: 'Track' }, answer: 'B', category: 'ถนน' },
  { id: 'r13', q: 'ถนนคอนกรีตมีข้อดีข้อไหน?', choices: { A: 'ถูกกว่า', B: 'ซ่อมน้อย', C: 'นุ่มกว่า', D: 'สีดำเงา' }, answer: 'B', category: 'ถนน' },
  { id: 'r14', q: 'ถนนแอสฟัลต์มีสีอะไร?', choices: { A: 'ขาว', B: 'ดำ', C: 'น้ำเงิน', D: 'เทา' }, answer: 'B', category: 'ถนน' },
  { id: 'r15', q: 'เครื่องจักรตัวใหญ่ที่ช่วยกระจายแอสฟัลต์ให้เท่ากันคืออะไร?', choices: { A: 'Mixer', B: 'Loader', C: 'Paver', D: 'Crane' }, answer: 'C', category: 'ถนน' },
  { id: 'r16', q: 'เวลาอากาศร้อนจัด ถนนแอสฟัลต์อาจเกิดอะไรขึ้น?', choices: { A: 'ยืดตัว', B: 'หดตัว', C: 'ละลายบางส่วน', D: 'แตกทันที' }, answer: 'C', category: 'ถนน' },
  { id: 'r17', q: 'การใช้โดรนในงานถนนช่วยอะไรได้?', choices: { A: 'ถ่ายรูปมุมสูง', B: 'ตรวจงานได้เร็วขึ้น', C: 'บันทึกข้อมูลพื้นที่', D: 'ถูกทุกข้อ' }, answer: 'D', category: 'ถนน' },
  { id: 'r18', q: 'เส้นบนถนนใช้สีอะไรทา?', choices: { A: 'สีธรรมดา', B: 'สีสะท้อนแสง', C: 'สีโป๊ว', D: 'สีชอล์ก' }, answer: 'B', category: 'ถนน' },
  { id: 'r19', q: 'ถนนลูกรังต่างจากถนนแอสฟัลต์อย่างไร?', choices: { A: 'ไม่มีการปูยางมะตอย', B: 'ใช้หินปูน', C: 'ใช้ยางพารา', D: 'สีส้มสวยกว่า' }, answer: 'A', category: 'ถนน' },
  { id: 'r20', q: 'ใครเป็นผู้ดูแลถนนของกรมทางหลวง?', choices: { A: 'ช่างตัดผม', B: 'วิศวกรโยธา', C: 'เจ้าหน้าที่ไฟฟ้า', D: 'คนสวน' }, answer: 'B', category: 'ถนน' },
  { id: 'r21', q: 'ถนนที่ราบเรียบและไม่มีรอยแตกช่วยอะไรได้มากที่สุด?', choices: { A: 'รถวิ่งประหยัดน้ำมัน', B: 'รถเร็วขึ้น', C: 'เสียงเงียบ', D: 'ทั้งหมด' }, answer: 'D', category: 'ถนน' },
  { id: 'r22', q: '“CBR” ใช้วัดอะไรในงานถนน?', choices: { A: 'น้ำหนักรถ', B: 'ความแข็งแรงของดิน', C: 'ความหนาของถนน', D: 'ปริมาณฝุ่น' }, answer: 'B', category: 'ถนน' },
  { id: 'r23', q: 'ทำไมต้องมีเส้นแบ่งกลางถนน?', choices: { A: 'เพื่อความสวยงาม', B: 'เพื่อแยกช่องทางจราจร', C: 'เพื่อสะท้อนแสง', D: 'เพื่อวาดลาย' }, answer: 'B', category: 'ถนน' },
  { id: 'r24', q: 'รถที่มักเห็นในงานก่อสร้างถนนเรียกว่าอะไร?', choices: { A: 'รถแบคโฮ', B: 'รถปูแอสฟัลต์', C: 'รถบด', D: 'ถูกทุกข้อ' }, answer: 'D', category: 'ถนน' },
  { id: 'r25', q: 'การดูแลถนนเป็นประจำช่วยอะไรได้?', choices: { A: 'ลดค่าใช้จ่ายซ่อม', B: 'ยืดอายุถนน', C: 'ปลอดภัยขึ้น', D: 'ทั้งหมด' }, answer: 'D', category: 'ถนน' },
];

const nila = [
  { id: 'n1',  q: 'Nila Solutions คือบริษัทที่ทำอะไร?', choices: { A: 'ทำขนม', B: 'พัฒนาเทคโนโลยีด้านถนน', C: 'เปิดรีสอร์ต', D: 'ทำเครื่องเสียงรถยนต์' }, answer: 'B', category: 'Nila' },
  { id: 'n2',  q: 'ระบบ “HMP Report” ของ Nila ใช้สำหรับอะไร?', choices: { A: 'รายงานยอดขาย', B: 'รายงานโรงผสมแอสฟัลต์', C: 'รายงานการเงิน', D: 'รายงานพนักงาน' }, answer: 'B', category: 'Nila' },
  { id: 'n3',  q: 'กลุ่มลูกค้าหลักของ Nila คือใคร?', choices: { A: 'นักเรียน', B: 'ผู้บริหารและวิศวกร', C: 'เกษตรกร', D: 'เจ้าของร้านกาแฟ' }, answer: 'B', category: 'Nila' },
  { id: 'n4',  q: 'เทคโนโลยีโดรนของ Nila ใช้ทำอะไรได้บ้าง?', choices: { A: 'ถ่ายรูป', B: 'ตรวจงานถนน', C: 'สำรวจพื้นที่', D: 'ถูกทุกข้อ' }, answer: 'D', category: 'Nila' },
  { id: 'n5',  q: 'Dashboard ของ Nila แสดงข้อมูลอะไร?', choices: { A: 'สภาพอากาศ', B: 'ผลฟุตบอล', C: 'ผลผลิตโรงผสม', D: 'ราคาอาหาร' }, answer: 'C', category: 'Nila' },
  { id: 'n6',  q: 'คำว่า “Hotmix” ในระบบ HMP หมายถึงอะไร?', choices: { A: 'เพลงร็อก', B: 'ถนนยางมะตอยร้อน', C: 'เครื่องดื่ม', D: 'ปูนซีเมนต์' }, answer: 'B', category: 'Nila' },
  { id: 'n7',  q: 'ฟีเจอร์ “Analytical Summary” ของ Nila ช่วยอะไรผู้บริหาร?', choices: { A: 'อ่านรายงานเร็วขึ้น', B: 'เข้าใจข้อมูลได้ง่าย', C: 'ใช้ตัดสินใจได้เร็ว', D: 'ทั้งหมด' }, answer: 'D', category: 'Nila' },
  { id: 'n8',  q: 'Nila Solutions ใช้เทคโนโลยีอะไรช่วยในงานวิเคราะห์ข้อมูล?', choices: { A: 'AI', B: 'หุ่นยนต์', C: 'เกม', D: 'VR' }, answer: 'A', category: 'Nila' },
  { id: 'n9',  q: 'จุดเด่นของระบบรายงาน Nila คืออะไร?', choices: { A: 'เข้าใจง่าย', B: 'ใช้งานสะดวก', C: 'รองรับทุกอุปกรณ์', D: 'ทั้งหมด' }, answer: 'D', category: 'Nila' },
  { id: 'n10', q: '“Tipco Asphalt” เป็นพันธมิตรกับ Nila ในด้านใด?', choices: { A: 'วัสดุแอสฟัลต์', B: 'การออกแบบเว็บไซต์', C: 'การตลาด', D: 'การขนส่ง' }, answer: 'A', category: 'Nila' },
  { id: 'n11', q: 'Nila Solutions มีเป้าหมายช่วยองค์กรในด้านใด?', choices: { A: 'ความบันเทิง', B: 'การจัดการข้อมูลและการตัดสินใจ', C: 'การจราจร', D: 'การตกแต่งถนน' }, answer: 'B', category: 'Nila' },
  { id: 'n12', q: 'ทำไม Nila ถึงเน้นการออกแบบให้ใช้งานง่าย?', choices: { A: 'เพื่อให้ผู้บริหาร Gen X ใช้งานได้สะดวก', B: 'เพราะต้องการขายได้เยอะ', C: 'เพราะเท่ดี', D: 'เพื่อโชว์เทคโนโลยี' }, answer: 'A', category: 'Nila' },
  { id: 'n13', q: 'Nila Solutions ก่อตั้งขึ้นเพื่อช่วยให้การทำงานแบบใดดีขึ้น?', choices: { A: 'การประชุม', B: 'การทำรายงานและติดตามงานถนน', C: 'การขนส่งสินค้า', D: 'การขายของออนไลน์' }, answer: 'B', category: 'Nila' },
  { id: 'n14', q: 'ระบบรายงานของ Nila ช่วยลดอะไรในองค์กร?', choices: { A: 'เอกสารซ้ำซ้อน', B: 'เวลาในการตรวจงาน', C: 'ความผิดพลาดจากคน', D: 'ทั้งหมด' }, answer: 'D', category: 'Nila' },
  { id: 'n15', q: 'Nila Solutions ใช้หลัก “Data-driven Decision” หมายถึงอะไร?', choices: { A: 'การตัดสินใจจากข้อมูล', B: 'การขับรถจากข้อมูล', C: 'การโทรจากข้อมูล', D: 'การซื้อของจากข้อมูล' }, answer: 'A', category: 'Nila' },
  { id: 'n16', q: 'การใช้ Dashboard รายเดือนของ Nila ช่วยให้ผู้บริหารเห็นอะไรชัดขึ้น?', choices: { A: 'กำไรขาดทุน', B: 'ประสิทธิภาพงานโรงผสม', C: 'สภาพถนนทั่วประเทศ', D: 'จำนวนพนักงาน' }, answer: 'B', category: 'Nila' },
  { id: 'n17', q: 'ระบบของ Nila ช่วยให้การตรวจหน้างานเป็นแบบใด?', choices: { A: 'Real-time', B: 'แบบจดมือ', C: 'รายเดือน', D: 'รายปี' }, answer: 'A', category: 'Nila' },
  { id: 'n18', q: 'Ravana ในระบบของ Nila เกี่ยวข้องกับอะไร?', choices: { A: 'ระบบการเงิน', B: 'เทคโนโลยีโดรน', C: 'งานออกแบบกราฟิก', D: 'ซอฟต์แวร์บัญชี' }, answer: 'B', category: 'Nila' },
  { id: 'n19', q: 'Nila Solutions ต้องการให้การรายงานผลของโรงผสมเป็นอย่างไร?', choices: { A: 'อัตโนมัติและเข้าใจง่าย', B: 'ทำมือแบบเดิม', C: 'ใช้กระดาษ', D: 'ส่งแฟกซ์' }, answer: 'A', category: 'Nila' },
  { id: 'n20', q: 'การพัฒนา “MVP” ของ Nila คืออะไร?', choices: { A: 'เวอร์ชันทดลองก่อนจริง', B: 'ชื่อโครงการลับ', C: 'ระบบคะแนนโบนัส', D: 'แอปมือถือ' }, answer: 'A', category: 'Nila' },
  { id: 'n21', q: 'Dashboard ของ Nila มักแสดงข้อมูลในรูปแบบใด?', choices: { A: 'กราฟและตัวเลข', B: 'เพลงและรูปภาพ', C: 'แผนที่อย่างเดียว', D: 'ตัวอักษรล้วน' }, answer: 'A', category: 'Nila' },
  { id: 'n22', q: 'จุดแข็งของ Nila เมื่อเทียบกับบริษัททั่วไปคืออะไร?', choices: { A: 'เข้าใจวงการถนนจริง', B: 'มีเทคโนโลยีเฉพาะทาง', C: 'ทำงานร่วมกับพันธมิตรใหญ่', D: 'ทั้งหมด' }, answer: 'D', category: 'Nila' },
  { id: 'n23', q: 'หากพูดว่า “Nila Solutions” คุณนึกถึงอะไร?', choices: { A: 'ถนนอัจฉริยะ', B: 'ระบบรายงานทันสมัย', C: 'นวัตกรรมไทย', D: 'ทั้งหมด' }, answer: 'D', category: 'Nila' },
  { id: 'n24', q: 'เป้าหมายของ Nila Solutions คืออะไร?', choices: { A: 'ทำให้ข้อมูลถนนเข้าถึงง่ายและแม่นยำ', B: 'ทำถนนเอง', C: 'เปิดคาเฟ่', D: 'สร้างเกม' }, answer: 'A', category: 'Nila' },
  { id: 'n25', q: 'ถ้าคุณอยากร่วมพัฒนาอนาคตของงานถนนกับเทคโนโลยี ควรพูดกับใคร?', choices: { A: 'Google', B: 'Nila Solutions', C: 'ร้านปูนซีเมนต์', D: 'นายอำเภอ' }, answer: 'B', category: 'Nila' },
];

const BANK = [...roads, ...nila];

// ----- State ---------------------------------------------------------------
const sessions = new Map(); // userId -> session

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomFive(userId) {
  const seed = Array.from(String(userId || '')).reduce((acc, ch) => acc + ch.charCodeAt(0), Date.now() % 1_000_000);
  const rand = rng(seed);
  const pool = [...BANK];
  // Fisher–Yates shuffle partial for first 5
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}

function formatQuestion(q, index, total) {
  return [
    `ข้อ ${index + 1}/${total}`,
    q.q,
    `A. ${q.choices.A}`,
    `B. ${q.choices.B}`,
    `C. ${q.choices.C}`,
    `D. ${q.choices.D}`,
    '',
    'ตอบด้วย A, B, C หรือ D',
  ].join('\n');
}

function quickABCD() {
  return [
    { label: 'A', text: 'A' },
    { label: 'B', text: 'B' },
    { label: 'C', text: 'C' },
    { label: 'D', text: 'D' },
    { label: 'ยกเลิก', text: 'ยกเลิกเกม' },
  ];
}

async function startGame(ev) {
  const userId = ev?.source?.userId || 'anon';
  const questions = pickRandomFive(userId);
  const session = {
    userId,
    at: Date.now(),
    qids: questions.map((q) => q.id),
    idx: 0,
    correct: 0,
  };
  sessions.set(userId, session);
  const q = questions[0];
  const text = `🎮 เริ่มเกมตอบคำถาม 5 ข้อ\nได้รางวัลเมื่อถูกอย่างน้อย 4 ข้อ\n\n${formatQuestion(q, 0, 5)}`;
  await replyQuickMenu(ev.replyToken, text, quickABCD());
  return true;
}

async function submitAnswer(ev, answerRaw) {
  const userId = ev?.source?.userId || 'anon';
  const session = sessions.get(userId);
  if (!session) {
    await replyQuickMenu(ev.replyToken, 'ยังไม่ได้เริ่มเกม พิมพ์ “เกม” เพื่อเริ่ม', [{ label: 'เริ่มเกม', text: 'เกม' }]);
    return true;
  }
  const answer = (String(answerRaw || '').trim().toUpperCase()[0] || '').replace(/[^ABCD]/g, '');
  if (!answer) {
    await replyQuickMenu(ev.replyToken, 'ตอบด้วย A, B, C หรือ D นะครับ', quickABCD());
    return true;
  }

  const questions = session.qids.map((id) => BANK.find((x) => x.id === id)).filter(Boolean);
  const q = questions[session.idx];
  const ok = q && q.answer === answer;
  if (ok) session.correct += 1;

  const feedback = ok ? '✅ ถูกต้อง' : `❌ ผิดครับ เฉลยคือ ${q.answer}`;
  session.idx += 1;

  if (session.idx >= 5) {
    const win = session.correct >= 4;
    const resultText = `จบเกม! คุณตอบถูก ${session.correct}/5 ${win ? '\n\n🎁 ยินดีด้วย! ได้รางวัล (Mock)' : ''}`;
    sessions.delete(userId);
    await replyQuickMenu(ev.replyToken, `${feedback}\n\n${resultText}`, [
      { label: 'เล่นอีกครั้ง', text: 'เกม' },
      { label: 'เมนู', text: 'เมนู' },
    ]);
    return true;
  }

  const nextQ = questions[session.idx];
  const text = `${feedback}\n\n${formatQuestion(nextQ, session.idx, 5)}`;
  await replyQuickMenu(ev.replyToken, text, quickABCD());
  return true;
}

export async function handleQuizMessage(ev) {
  const raw = (ev?.message?.text || '').trim();
  const t = raw.toLowerCase();
  if (/^(เกม|เกมส์|quiz|game|ควิซ|เริ่มเกม)$/.test(t)) {
    return startGame(ev);
  }
  if (/^[abcd]\b/i.test(raw) || /^ตอบ\s*[abcd]\b/i.test(t)) {
    const m = raw.match(/[ABCD]/i);
    const a = m ? m[0].toUpperCase() : '';
    if (a) return submitAnswer(ev, a);
  }
  if (/^ยกเลิกเกม$/.test(t)) {
    const userId = ev?.source?.userId || 'anon';
    sessions.delete(userId);
    await replyQuickMenu(ev.replyToken, 'ยกเลิกเกมแล้ว', [{ label: 'เริ่มใหม่', text: 'เกม' }, { label: 'เมนู', text: 'เมนู' }]);
    return true;
  }
  return false;
}

export default { handleQuizMessage };
