const mongoose = require('mongoose');


const RecordSchema = new mongoose.Schema(
{
companyId: { type: String, index: true },
weighType: { type: String, enum: ['BUY', 'SELL'], index: true },


productName: { type: String, index: true },
productCode: { type: String },


unit: { type: String, default: 'ตัน' }, // คง unit แสดงผลเป็น "ตัน"
quantityTon: { type: Number, default: 0 },
rawWeightKg: { type: Number, default: 0 },


date: { type: Date, index: true },
dateKey: { type: String, index: true }, // YYYY-MM-DD (ตาม DEFAULT_TZ)


// SELL เท่านั้น (ถ้ามี mapping จาก Mix)
siteName: { type: String },
siteCode: { type: String },


sourceExcel: { type: String }, // ไว้บันทึกไฟล์ต้นทาง
rowHash: { type: String, index: true }, // ป้องกันซ้ำ
},
{ timestamps: true }
);


// Dedupe หลัก: ไม่ให้แถวซ้ำในวันเดียวกัน/บริษัทเดียวกัน
RecordSchema.index(
{ companyId: 1, dateKey: 1, rowHash: 1 },
{ unique: true }
);


module.exports = mongoose.model('Record', RecordSchema);