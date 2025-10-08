// src/models/Record.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const RecordSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    sourceCompanyId: { type: String, index: true },
    sourceCompanyName: { type: String, default: '' },

    // วันที่ "สตริง" เก็บแบบ CE: YYYY-MM-DD (ถ้าไฟล์เก่าเป็น พ.ศ. เรา normalize ตอน import แล้ว)
    dateStr: { type: String, required: true, index: true },

    // BUY / SELL (บางไฟล์เก่าอาจเว้น เราจัดการเดาใน parser แล้ว)
    type: { type: String, enum: ['BUY', 'SELL'], index: true },

    // สินค้า/รายละเอียด
    product: { type: String, default: '' },
    productDetail: { type: String, default: '' },

    // ปริมาณ (ตัน)
    weightTons: { type: Number, default: 0 },

    unit: { type: String, default: 'ตัน' },
    customer: { type: String, default: '' },
    note: { type: String, default: '' },

    // โค้ด/ชื่อโครงการ (จาก mix map ถ้ามี)
    projectCode: { type: String, default: '', index: true },
    projectName: { type: String, default: '' },

    // คีย์กันซ้ำ -> อ้างจากแถวที่ parse แล้ว (ตามเนื้อหาแถว)
    rowHash: { type: String, required: true },

    // ฟิลด์ประวัติ/เผื่ออนาคต (ไม่ใช้ทำ unique แล้ว)
    direction: { type: String, default: null },
    weighNumber: { type: String, default: null },
  },
  { timestamps: true, strict: true }
);

// ------ Indexes (มาตรฐานใหม่) ------

// 1) ค้นสรุปรายวัน/รายบริษัท
RecordSchema.index({ companyId: 1, dateStr: 1 }, { name: 'by_company_date' });
RecordSchema.index({ sourceCompanyId: 1, dateStr: 1 }, { name: 'by_source_company_date' });

// 2) กันซ้ำตามแฮชที่เราสร้างจากเนื้อหาแถว
RecordSchema.index(
  { companyId: 1, sourceCompanyId: 1, sourceCompanyName: 1, rowHash: 1 },
  { name: 'uniq_company_rowhash', unique: true }
);

// !! หมายเหตุ: อย่าใช้ unique เดิม companyId+direction+weighNumber อีกต่อไป

const Record = mongoose.model('Record', RecordSchema);
export default Record;
