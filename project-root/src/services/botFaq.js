// src/services/botFaq.js
import BotFaq, { normaliseForMatch } from '../models/BotFaq.js';

let cachedFaqs = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

const baseSuggestions = [
  'พิมพ์ "เมนู" เพื่อดูคำสั่งหลัก',
  'ต้องการสรุปรายวันพิมพ์ "สรุป วันนี้"',
];

function shouldReload() {
  if (!cacheLoadedAt) return true;
  return Date.now() - cacheLoadedAt > CACHE_TTL_MS;
}

export async function loadBotFaqCache(force = false) {
  if (!force && !shouldReload()) return cachedFaqs;

  const items = await BotFaq.find({ isActive: true })
    .sort({ priority: 1, updatedAt: -1 })
    .lean();

  cachedFaqs = items.map((item) => ({
    ...item,
    keywords: (item.keywords || []).filter(Boolean),
    matchKeywords: (item.matchKeywords || (item.keywords || []).map((kw) => normaliseForMatch(kw))).filter(Boolean),
    answer: String(item.answer || '').trim(),
    suggestions: (item.suggestions || []).filter(Boolean),
  }));
  cacheLoadedAt = Date.now();
  return cachedFaqs;
}

export function invalidateBotFaqCache() {
  cacheLoadedAt = 0;
}

function prepareReply(entry) {
  const suggestions = entry.suggestions && entry.suggestions.length
    ? entry.suggestions
    : baseSuggestions;

  const suggestionText = suggestions.length
    ? '\n\nคำแนะนำเพิ่มเติม:\n• ' + suggestions.join('\n• ')
    : '';

  return `${entry.answer}${suggestionText}`.trim();
}

function scoreMatch(entry, keyword) {
  return {
    entry,
    keyword,
    length: keyword.length,
    priority: entry.priority ?? 10,
  };
}

export async function findBotFaqResponse(messageText) {
  const text = String(messageText || '').trim();
  if (!text) return null;

  const dataset = await loadBotFaqCache();
  if (!dataset.length) return null;

  const normalizedText = normaliseForMatch(text);
  if (!normalizedText) return null;

  const matches = [];

  for (const entry of dataset) {
    for (const keyword of entry.matchKeywords) {
      if (!keyword) continue;
      if (normalizedText.includes(keyword)) {
        matches.push(scoreMatch(entry, keyword));
      }
    }
  }

  if (!matches.length) return null;

  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (b.length !== a.length) return b.length - a.length;
    return (a.entry.updatedAt || 0) > (b.entry.updatedAt || 0) ? -1 : 1;
  });

  const best = matches[0]?.entry;
  if (!best) return null;

  BotFaq.updateOne(
    { _id: best._id },
    { $inc: { usageCount: 1 }, $set: { lastMatchedAt: new Date() } }
  ).catch((err) => console.warn('[BotFaq] usage update failed:', err.message));

  return {
    ...best,
    reply: prepareReply(best),
  };
}

export async function getBotFaqStats() {
  const [total, active, recentMatch] = await Promise.all([
    BotFaq.countDocuments({}),
    BotFaq.countDocuments({ isActive: true }),
    BotFaq.findOne({ isActive: true, lastMatchedAt: { $ne: null } })
      .sort({ lastMatchedAt: -1 })
      .lean(),
  ]);

  return {
    total,
    active,
    lastMatchedAt: recentMatch?.lastMatchedAt || null,
  };
}

export async function bulkInsertFaqs(entries = [], opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0 };

  const docs = entries
    .map((entry) => {
      const keywordSource = Array.isArray(entry.keyword)
        ? entry.keyword
        : Array.isArray(entry.keywords)
        ? entry.keywords
        : [entry.keyword || entry.keywords];

      const keywords = (keywordSource || [])
        .map((kw) => String(kw || '').trim())
        .filter(Boolean);

      return {
        title: entry.title || keywords[0] || '',
        intent: entry.intent || 'ทั่วไป',
        answer: entry.answer,
        keywords,
        suggestions: entry.suggestions || [],
        tags: entry.tags || [],
        priority: Number(entry.priority ?? 10),
        isActive: entry.isActive !== false,
      };
    })
    .filter((entry) => entry.answer && Array.isArray(entry.keywords) && entry.keywords.length);

  if (!docs.length) return { inserted: 0 };

  docs.forEach((doc) => {
    doc.matchKeywords = doc.keywords.map((kw) => normaliseForMatch(kw)).filter(Boolean);
  });

  const operations = docs.map((doc) => ({
    updateOne: {
      filter: {
        answer: doc.answer,
        intent: doc.intent,
      },
      update: {
        $setOnInsert: { createdAt: new Date() },
        $set: doc,
      },
      upsert: true,
    },
  }));

  if (!operations.length) return { inserted: 0 };

  const result = await BotFaq.bulkWrite(operations, { ordered: false });
  if (opts.refreshCache !== false) invalidateBotFaqCache();

  const inserted = result.upsertedCount || 0;
  return { inserted };
}
