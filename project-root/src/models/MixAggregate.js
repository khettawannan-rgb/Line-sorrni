import mongoose from 'mongoose';

const { Schema } = mongoose;

const MixAggregateSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    sourceCompanyId: { type: String, default: '', index: true },
    sourceCompanyName: { type: String, default: '' },
    projectCode: { type: String, default: '', index: true },
    projectName: { type: String, required: true },
    dateStr: { type: String, required: true, index: true },
    mixName: { type: String, default: '' },
    totalNetWeightTons: { type: Number, default: 0 },
    entryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MixAggregateSchema.index(
  { dateStr: 1, sourceCompanyId: 1, projectCode: 1 },
  { partialFilterExpression: { sourceCompanyId: { $exists: true, $ne: '' } } }
);
MixAggregateSchema.index(
  { dateStr: 1, companyId: 1, projectCode: 1 },
  { partialFilterExpression: { companyId: { $exists: true, $ne: null } } }
);
MixAggregateSchema.index({ projectName: 1, totalNetWeightTons: -1 });

const MixAggregate = mongoose.model('MixAggregate', MixAggregateSchema);

export default MixAggregate;
