// project-root/src/models/lineMedia.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const LocationSchema = new Schema(
  {
    latitude: Number,
    longitude: Number,
    address: String,
  },
  { _id: false }
);

const LineMediaSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    type: { type: String, enum: ['image', 'location'], required: true },
    imagePath: String,
    storageProvider: { type: String, default: 'local' },
    location: LocationSchema,
    timestamp: { type: Date, required: true },
    relatedMedia: { type: Schema.Types.ObjectId, ref: 'LineMedia' },
    rawEvent: Schema.Types.Mixed,
  },
  { timestamps: true }
);

LineMediaSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('LineMedia', LineMediaSchema);
