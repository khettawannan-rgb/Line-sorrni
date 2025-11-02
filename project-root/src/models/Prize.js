// project-root/src/models/Prize.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const PrizeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    total: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true, strict: true }
);

PrizeSchema.index({ name: 1 }, { unique: true, collation: { locale: 'th', strength: 2 }, name: 'uniq_prize_name' });

PrizeSchema.virtual('available').get(function available() {
  const total = Number(this.total || 0);
  const reserved = Number(this.reserved || 0);
  const used = Number(this.used || 0);
  const avail = total - reserved - used;
  return avail > 0 ? avail : 0;
});

const Prize = mongoose.model('Prize', PrizeSchema);
export default Prize;

