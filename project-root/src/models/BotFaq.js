import mongoose from 'mongoose';

const normaliseKeyword = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();

const normaliseForMatch = (value = '') =>
  normaliseKeyword(value)
    .replace(/\s+/g, '')
    .replace(/[\u200b\u200c\u200d]/g, '')
    .replace(/[\-_.:,;!?"'()\[\]{}]/g, '');

const BotFaqSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    intent: { type: String, trim: true, default: '' },
    answer: { type: String, required: true, trim: true },
    keywords: {
      type: [String],
      required: true,
      set: (list = []) =>
        Array.from(
          new Set(
            (Array.isArray(list) ? list : [list])
              .map((item) => normaliseKeyword(item))
              .filter(Boolean)
          )
        ),
    },
    suggestions: {
      type: [String],
      default: [],
      set: (list = []) =>
        Array.from(
          new Set(
            (Array.isArray(list) ? list : [list])
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          )
        ),
    },
    tags: {
      type: [String],
      default: [],
      set: (list = []) =>
        Array.from(
          new Set(
            (Array.isArray(list) ? list : [list])
              .map((item) => normaliseKeyword(item))
              .filter(Boolean)
          )
        ),
    },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 10, min: 0, max: 999 },
    usageCount: { type: Number, default: 0 },
    lastMatchedAt: { type: Date, default: null },
    createdBy: { type: String, trim: true, default: '' },
    updatedBy: { type: String, trim: true, default: '' },
    matchKeywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

BotFaqSchema.pre('save', function preSave(next) {
  this.matchKeywords = (this.keywords || []).map((kw) => normaliseForMatch(kw)).filter(Boolean);
  if (!this.title && this.keywords && this.keywords.length) {
    this.title = this.keywords[0];
  }
  next();
});

BotFaqSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id.toString(),
    title: this.title,
    intent: this.intent,
    answer: this.answer,
    keywords: this.keywords,
    suggestions: this.suggestions,
    tags: this.tags,
    isActive: this.isActive,
    priority: this.priority,
    usageCount: this.usageCount,
    lastMatchedAt: this.lastMatchedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

BotFaqSchema.statics.normaliseForMatch = normaliseForMatch;

BotFaqSchema.index({ isActive: 1, priority: 1 });
BotFaqSchema.index({ matchKeywords: 1 });
BotFaqSchema.index({ intent: 1 });

const BotFaq = mongoose.model('BotFaq', BotFaqSchema);

export default BotFaq;
export { normaliseForMatch };
