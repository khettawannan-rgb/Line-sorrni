import mongoose from 'mongoose';

const { Schema } = mongoose;

const LineBindingSchema = new Schema(
  {
    lineUserId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    role: { type: String, enum: ['member', 'admin', 'super'], default: 'member' },
    status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'active', index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

LineBindingSchema.index({ lineUserId: 1, companyId: 1 }, { unique: true });
LineBindingSchema.index({ memberId: 1 }, { unique: true, sparse: true });

export default mongoose.model('LineBinding', LineBindingSchema);
