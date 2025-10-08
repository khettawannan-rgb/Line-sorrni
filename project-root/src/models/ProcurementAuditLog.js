// project-root/src/models/ProcurementAuditLog.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ChangeEntrySchema = new Schema(
  {
    field: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ProcurementAuditLogSchema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['PR', 'PO', 'VENDOR', 'STOCK'],
      required: true,
    },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true },
    actor: { type: String, default: 'system' },
    actorId: { type: Schema.Types.ObjectId, ref: 'Member' },
    message: { type: String, default: '' },
    changes: { type: [ChangeEntrySchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: true }
);

ProcurementAuditLogSchema.index(
  { entityType: 1, entityId: 1, createdAt: -1 },
  { name: 'by_entity_recent' }
);

const ProcurementAuditLog = mongoose.model(
  'ProcurementAuditLog',
  ProcurementAuditLogSchema
);
export default ProcurementAuditLog;
