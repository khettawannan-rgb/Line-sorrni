// src/models/Member.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const MemberSchema = new Schema(
  {
    lineUserId: { type: String, index: true, unique: true, required: true },
    displayName: { type: String },
    pictureUrl: { type: String },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    role: { type: String, enum: ['member', 'admin', 'super'], default: 'member' },
    active: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MemberSchema.virtual('isActive')
  .get(function getIsActive() {
    return this.active;
  })
  .set(function setIsActive(value) {
    this.active = value;
  });

MemberSchema.set('toObject', { virtuals: true });
MemberSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Member', MemberSchema);
