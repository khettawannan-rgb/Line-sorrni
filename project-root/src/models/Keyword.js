import mongoose from 'mongoose';

const KeywordSchema = new mongoose.Schema({
  keyword: { type: String, required: true, unique: true },
  replyType: { type: String, enum: ['text', 'template'], default: 'text' },
  replyText: { type: String, default: '' },
  templateCode: { type: String, default: '' },
}, { timestamps: true });

const Keyword = mongoose.model('Keyword', KeywordSchema);
export default Keyword;
