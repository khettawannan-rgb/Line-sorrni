// project-root/src/models/StockItem.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const UsageHistorySchema = new Schema(
  {
    dateStr: { type: String, required: true },
    quantity: { type: Number, default: 0 },
    type: { type: String, enum: ['in', 'out'], default: 'out' },
  },
  { _id: false }
);

const StockItemSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    itemName: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, index: true },
    unit: { type: String, default: 'ตัน' },
    currentQuantity: { type: Number, default: 0 },
    reorderPoint: { type: Number, default: 0 },
    safetyStock: { type: Number, default: 0 },
    avgDailyUsage: { type: Number, default: 0 },
    forecastDepletionDate: { type: Date, default: null },
    lastRecordDate: { type: String, default: '' },
    source: { type: String, default: 'weighbridge' },
    tags: { type: [String], default: [] },
    usageHistory: { type: [UsageHistorySchema], default: [] },
    metadata: {
      projectCode: { type: String, default: '' },
      category: { type: String, default: '' },
      lastReorderAt: { type: Date, default: null },
    },
  },
  { timestamps: true, strict: true }
);

StockItemSchema.index(
  { companyId: 1, itemName: 1 },
  { unique: true, collation: { locale: 'th', strength: 2 }, name: 'uniq_company_item' }
);
StockItemSchema.index({ forecastDepletionDate: 1 }, { name: 'by_depletion' });

const StockItem = mongoose.model('StockItem', StockItemSchema);
export default StockItem;
