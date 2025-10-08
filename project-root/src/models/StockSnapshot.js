// project-root/src/models/StockSnapshot.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const SnapshotItemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    sku: { type: String, trim: true },
    unit: { type: String, default: 'ตัน' },
    currentQuantity: { type: Number, default: 0 },
    reorderPoint: { type: Number, default: 0 },
    avgDailyUsage: { type: Number, default: 0 },
    projectedRunoutDate: { type: Date, default: null },
    sourceRecordDate: { type: String, default: '' },
  },
  { _id: false }
);

const StockSnapshotSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    generatedAt: { type: Date, default: Date.now },
    items: { type: [SnapshotItemSchema], default: [] },
    source: { type: String, default: 'weighbridge' },
    message: { type: String, default: '' },
    thresholdConfig: {
      defaultReorderPoint: { type: Number, default: 10 },
      safetyStockDays: { type: Number, default: 2 },
    },
  },
  { timestamps: true, strict: true }
);

StockSnapshotSchema.index(
  { companyId: 1, generatedAt: -1 },
  { name: 'by_snapshot_company' }
);

const StockSnapshot = mongoose.model('StockSnapshot', StockSnapshotSchema);
export default StockSnapshot;
