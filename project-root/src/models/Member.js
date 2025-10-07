// src/models/Member.js
import mongoose from 'mongoose';

const MemberSchema = new mongoose.Schema(
  {
    lineUserId: { type: String, index: true, unique: true, required: true },
    displayName: { type: String },
    pictureUrl: { type: String },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    isActive: { type: Boolean, default: false },  // ให้แอดมินอนุมัติจากหน้า Members
  },
  { timestamps: true }
);

export default mongoose.model('Member', MemberSchema);
