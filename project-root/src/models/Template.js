import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  content: { type: String, default: '' },
}, { timestamps: true });

const Template = mongoose.model('Template', TemplateSchema);
export default Template;
