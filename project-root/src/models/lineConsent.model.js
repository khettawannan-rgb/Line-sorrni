// project-root/src/models/lineConsent.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ConsentHistorySchema = new Schema(
  {
    status: { type: String, enum: ['pending', 'granted', 'revoked'], required: true },
    at: { type: Date, default: Date.now },
    channel: { type: String, default: 'web' },
    ip: String,
    note: String,
  },
  { _id: false }
);

const LineConsentSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    displayName: String,
    pictureUrl: String,
    status: { type: String, enum: ['pending', 'granted', 'revoked'], default: 'pending' },
    grantedAt: Date,
    revokedAt: Date,
    lastPromptedAt: Date,
    history: { type: [ConsentHistorySchema], default: [] },
    profile: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default mongoose.model('LineConsent', LineConsentSchema);
