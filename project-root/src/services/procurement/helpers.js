// project-root/src/services/procurement/helpers.js
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

import { PR_NUMBER_PREFIX, PO_NUMBER_PREFIX } from './constants.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = process.env.APP_DEFAULT_TZ || 'Asia/Bangkok';

export function now() {
  return dayjs().tz(TZ);
}

export function formatDate(date, format = 'DD MMM YYYY') {
  if (!date) return '-';
  return dayjs(date).tz(TZ).format(format);
}

function buildSequencePart(seq) {
  return String(seq).padStart(4, '0');
}

export function generateDocumentNumber(type, sequence, date = new Date()) {
  const prefix = type === 'PO' ? PO_NUMBER_PREFIX : PR_NUMBER_PREFIX;
  const datePart = dayjs(date).tz(TZ).format('YYYYMMDD');
  const sequencePart = buildSequencePart(sequence);
  return `${prefix}-${datePart}-${sequencePart}`;
}

export function diffDays(from, to) {
  if (!from || !to) return null;
  return dayjs(to).diff(dayjs(from), 'day');
}

export function computeLineTotal(quantity = 0, unitPrice = 0) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return Number((qty * price).toFixed(2));
}

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function groupBy(items = [], keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(item);
    return acc;
  }, new Map());
}

export function toPlainObject(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return JSON.parse(JSON.stringify(doc));
}
