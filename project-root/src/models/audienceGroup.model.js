// project-root/src/models/audienceGroup.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const AudienceGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    userIds: { type: [String], default: [], index: true },
  },
  { timestamps: true }
);

AudienceGroupSchema.virtual('size').get(function size() {
  return Array.isArray(this.userIds) ? this.userIds.length : 0;
});

AudienceGroupSchema.set('toJSON', { virtuals: true });
AudienceGroupSchema.set('toObject', { virtuals: true });

export default mongoose.model('AudienceGroup', AudienceGroupSchema);

