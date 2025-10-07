// src/models/MixMap.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    sourceCompanyId: { type: String, index: true },
    sourceCompanyName: { type: String, default: '' },
    code: { type: String, required: true },
    name: { type: String, default: '' },
    mixName: { type: String, default: '' },
  },
  { timestamps: true }
);

// หนึ่งบริษัทจริง + หนึ่ง code มีรายการเดียว
schema.index(
  { companyId: 1, code: 1 },
  { unique: true, partialFilterExpression: { companyId: { $exists: true, $ne: null } } }
);

// หนึ่งบริษัทจากไฟล์ + หนึ่ง code มีรายการเดียว
schema.index(
  { sourceCompanyId: 1, code: 1 },
  { unique: true, partialFilterExpression: { sourceCompanyId: { $exists: true, $ne: null, $ne: '' } } }
);

export default mongoose.model('MixMap', schema);
