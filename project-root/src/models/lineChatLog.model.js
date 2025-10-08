// project-root/src/models/lineChatLog.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const LineChatLogSchema = new Schema(
  {
    userId: { type: String, index: true },
    type: String,
    messageType: String,
    text: String,
    payload: Schema.Types.Mixed,
    timestamp: { type: Number },
    consentGranted: { type: Boolean, default: false },
    consentStatus: { type: String, enum: ['granted', 'pending', 'revoked', 'unknown'], default: 'unknown', index: true },
  },
  { timestamps: true }
);

LineChatLogSchema.index({ createdAt: -1 });
LineChatLogSchema.index({ timestamp: -1 });

export default mongoose.model('LineChatLog', LineChatLogSchema);
