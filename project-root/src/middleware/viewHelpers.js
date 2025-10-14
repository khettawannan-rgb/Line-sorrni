import dayjs from 'dayjs';
import 'dayjs/locale/th.js';

function safeGet(obj, path, def = null) {
  if (!path) return obj ?? def;
  try {
    return path.split('.').reduce((acc, key) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[key];
    }, obj) ?? def;
  } catch {
    return def;
  }
}

function formatNumber(value, options = {}) {
  const fallback = options.fallback ?? '0';
  if (value === null || value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const localeOpts = { ...options };
  delete localeOpts.fallback;
  return numeric.toLocaleString('th-TH', localeOpts);
}

function formatMoney(value) {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value, format = 'DD MMM YYYY', fallback = '-') {
  if (!value) return fallback;
  const d = dayjs(value);
  if (!d.isValid()) return fallback;
  return d.locale('th').format(format);
}

export default function viewHelpers(req, res, next) {
  res.locals.get = res.locals.get || safeGet;
  res.locals.num = res.locals.num || formatNumber;
  res.locals.money = res.locals.money || formatMoney;
  res.locals.dateFmt = res.locals.dateFmt || formatDate;
  res.locals.dayjs = dayjs;
  const isLineUserAgent = /Line\/\d+/i.test(req.headers['user-agent'] || '');
  res.locals.isLine = isLineUserAgent;
  if (typeof res.locals.isGuest !== 'boolean') {
    res.locals.isGuest = !req.session?.user;
  }
  next();
}
