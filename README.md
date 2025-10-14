# NILA · Admin Launcher for LINE

ชุดฟีเจอร์ใหม่สำหรับ “NILA · Admin” เพื่อให้ทีมจัดซื้อสามารถใช้งานผ่าน LINE Official Account และเบราว์เซอร์ภายนอกได้สะดวกยิ่งขึ้น ครอบคลุมตั้งแต่ LIFF launcher, PR/PO workflow, PDF export, ไปจนถึง quick form สำหรับการอนุมัติแบบเร่งด่วน

## 🚀 Getting Started

```bash
npm install
cp .env.example .env   # หรือปรับค่าจาก .env ปัจจุบันให้ครบตามหัวข้อด้านล่าง
npm run start
```

> **Tip:** ระหว่างพัฒนาสามารถใช้ `npm run dev` (มี nodemon) เพื่อ reload อัตโนมัติ

## 🔐 Environment Variables

ไฟล์ `.env` ต้องมีค่าต่อไปนี้ (ดูตัวอย่างใน repo ที่อัปเดตแล้ว)

```env
BASE_URL=https://nila-admin.sorni.dev
SESSION_SECRET=<สุ่มค่าอย่างน้อย 32 ตัวอักษร>
MONGODB_URI=<MongoDB connection string>
LIFF_ID=<LIFF ID ที่ได้จาก LINE Developers>
```

ค่าอื่น ๆ จากโปรเจ็กต์เดิมยังใช้ได้ตามปกติ เช่น `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`

## 🆔 ตั้งค่า LIFF

1. ไปที่ [LINE Developers Console](https://developers.line.biz/console/) และสร้าง LIFF app (ประเภท `Full` หรือ `Compact` ก็ได้)
2. ตั้งค่า LIFF URL ให้ชี้มาที่ `https://nila-admin.sorni.dev/liff-open-admin`
3. นำ `LIFF ID` มาใส่ใน `.env` (`LIFF_ID=...`)
4. ปรับ whitelist domain ให้ครอบคลุม
   - `https://nila-admin.sorni.dev`
   - `https://liff.line.me`

หลังจากตั้งค่าแล้ว ให้ใช้ลิงก์จากหัวข้อ **Important URLs** ด้านล่างเพื่อผูกกับปุ่ม/เมนูใน LINE OA

## 🗂️ Procurement Workflow Highlights

- **PR Dashboard** (`/admin/pr`) – ค้นหา/กรอง/เพจ และจัดการสถานะ Draft → Waiting Approval → Approved/Rejected/Closed
- **PR Form** (`/admin/pr/new`) – เพิ่ม/แก้ไขรายการสินค้าพร้อม VAT, แนบไฟล์ และ Submit for approval
- **Approve & Auto Create PO** (`POST /admin/pr/:id/approve`) – อนุมัติแล้วสร้าง PO draft พร้อมผูกข้อมูลขนส่งอัตโนมัติ
- **PO Dashboard / Form / Detail** – ติดตามสถานะ (Draft, Approved, Sent, Received, Cancelled), ส่งออก PDF, ดาวน์โหลดไฟล์
- **Quick Forms สำหรับ LINE**  
  - `/line/forms/quick-pr` (สร้าง PR เร่งด่วน 1–2 รายการ)  
  - `/line/approve/pr/:id` (หน้า Approve/Reject แบบเบา ๆ)

## 📄 Seed Demo Data

สร้าง vendor + PR + PO ตัวอย่างด้วยคำสั่ง:

```bash
npm run seed:procurement
```

สคริปต์จะเชื่อมต่อ MongoDB ตาม `MONGODB_URI`, สร้างผู้ขาย “NILA Procurement Demo”, PR พร้อม line items และ PO draft ที่เชื่อมกัน

## 🔍 Postman / cURL

ไฟล์ `docs/nila-admin.postman_collection.json` มี request สำคัญ เช่น

- Launch admin via LIFF wrapper
- Create PR / Approve PR / Create PO
- Download PO PDF

Import เข้า Postman แล้วตั้งค่าตัวแปร `base_url`, `session_cookie`, `vendor_id`, `pr_id`, `po_id` ตาม environment ของคุณ

## 🧩 Flex Button Snippets

ไฟล์ `docs/flex-buttons.json` รวมตัวอย่าง Flex JSON ปุ่ม

- `เปิด PR` → `https://liff.line.me/<LIFF_ID>?to=/admin/pr`
- `สร้าง PO` → `https://liff.line.me/<LIFF_ID>?to=/admin/po/new`
- `อนุมัติ PR` → `https://liff.line.me/<LIFF_ID>?to=/line/approve/pr/{{PR_ID}}`

แทน `<LIFF_ID>` ด้วยค่าจริงใน `.env` (ดูหัวข้อถัดไปสำหรับ URL ที่เติมค่าไว้ให้แล้ว)

## 🔗 Important URLs (พร้อมค่าใน repo นี้)

- `LIFF_BASE` – https://liff.line.me/1657917536-LAUNCHER  
- `LIFF_PR` – https://liff.line.me/1657917536-LAUNCHER?to=/admin/pr  
- `LIFF_PO_NEW` – https://liff.line.me/1657917536-LAUNCHER?to=/admin/po/new

นำลิงก์เหล่านี้ไปใช้กับปุ่ม OA, Flex Message, หรือเมนูได้ทันที

## ✅ ตรวจสอบก่อนขึ้นระบบ

- [ ] เพิ่มค่า SSL proxy (เช่น Cloudflare/ALB) เพื่อส่ง `x-forwarded-proto=https`
- [ ] ตั้งค่า Session cookie domain ให้ตรงกับ production domain (ถ้าต้องการ)
- [ ] ทดสอบ quick forms บน LINE app (iOS/Android) ให้ครบทุก flow
- [ ] อัปเดตไฟล์ `.env` บนเซิร์ฟเวอร์ production ด้วยค่า LIFF/BASE URL ที่ถูกต้อง

พร้อมใช้งาน! หากต้องการ workflow เพิ่มเติม (เช่น ส่งอีเมล, แจ้ง LINE OA เมื่ออนุมัติ) สามารถต่อยอดจาก service เดิมใน `project-root/src/services/procurement` ได้ทันที
