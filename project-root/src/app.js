import 'dotenv/config.js';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';

import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import cors from 'cors';
import expressLayouts from 'express-ejs-layouts';
import bodyParser from 'body-parser';
import morgan from 'morgan';

import adminRouter from './routes/admin.js';
import webhookRouter from './routes/webhook.js';
import consentRouter from './routes/consent.js';
import lineFormsRouter from './routes/lineForms.js';
import lineRouter from './routes/line.js';
import authLineRouter from './routes/auth_line.js';
import { setupDailyCron } from './jobs/scheduler.js';
import { liffLink } from './utils/liff.js';
import { getBotInfo } from './services/line.js';
import adviceRouter from './routes/advice.js';
import aiRouter from './routes/ai.js';
import mockDailySummaryRouter from './routes/mockDailySummary.js';
import cdpRouter from './routes/cdp.js';
import galleryRouter from './routes/gallery.js';
import checkSuperAdmin from './middleware/checkSuperAdmin.js';
import viewHelpers from './middleware/viewHelpers.js';

const PORT = Number(process.env.PORT || 10000);
const PRIMARY_MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/line-erp-notifier';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const LIFF_ID = process.env.LIFF_ID || process.env.LIFF_ID_AI || '';
const TRUSTED_ORIGINS = [BASE_URL, 'https://liff.line.me'].filter(Boolean);

try {
  try {
    console.log('LIFF_BASE   =', liffLink());
    console.log('LIFF_PR     =', liffLink('/admin/pr'));
    console.log('LIFF_PO_NEW =', liffLink('/admin/po/new'));
  } catch (err) {
    console.warn('[LIFF] Failed to log LIFF links:', err.message);
  }
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = TRUSTED_ORIGINS.some((allowed) => {
      if (!allowed) return false;
      if (allowed === origin) return true;
      return origin.startsWith(`${allowed}/`);
    });
    if (isAllowed) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  const protoHeader = req.get('x-forwarded-proto');
  const forwardedProto = protoHeader ? protoHeader.split(',')[0].trim() : '';
  if (forwardedProto && forwardedProto !== 'https') {
    const host = req.get('host');
    const redirectUrl = `https://${host}${req.originalUrl}`;
    return res.redirect(301, redirectUrl);
  }
  return next();
});

let mongoReady = false;
let mongoErrorMessage = '';

mongoose.connection.on('connected', () => {
  mongoReady = true;
  mongoErrorMessage = '';
  console.log('✅ MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  mongoReady = false;
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  mongoReady = false;
  mongoErrorMessage = err?.message || 'Unknown MongoDB error';
  console.error('❌ MongoDB error event:', mongoErrorMessage);
});

// ===== Logs =====
app.use(morgan('dev'));

// ===== Views =====
const viewsDir = path.join(__dirname, 'views');
app.set('views', viewsDir);
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

console.log('[VIEWS DIR]', viewsDir);
console.log('[VIEW ENGINE] ejs');

// ===== Static =====
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use('/storage', express.static(path.resolve('storage')));
const liffPublicDir = path.join(__dirname, '../public/liff');
if (fs.existsSync(liffPublicDir)) {
  app.use(
    '/liff',
    (req, res, next) => {
      res.set('X-Robots-Tag', 'noindex, nofollow');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    },
    express.static(liffPublicDir, { extensions: ['html', 'htm', 'json'], etag: false })
  );
}

const FEATURE_WEATHER = String(process.env.FEATURE_WEATHER_ADVICE || '').toLowerCase() === 'true';
const FEATURE_STOCK = String(process.env.FEATURE_STOCK_ALERTS || '').toLowerCase() === 'true';
if (FEATURE_WEATHER || FEATURE_STOCK) {
  app.use(adviceRouter);
}

// ===== Webhook (raw body) =====
app.use(['/webhook/line', '/webhook'], webhookRouter);

// ===== Parsers =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===== Session =====
const isProd = String(process.env.NODE_ENV).toLowerCase() === 'production';
let sessionStore;
if (isProd) {
  if (!PRIMARY_MONGO_URI) {
    console.warn('[SESSION] MONGODB_URI is not defined. Falling back to MemoryStore.');
  } else {
    sessionStore = MongoStore.create({
      mongoUrl: PRIMARY_MONGO_URI,
      collectionName: 'sessions',
      crypto: { secret: SESSION_SECRET },
    });
    console.log('[SESSION] MongoStore enabled');
  }
}

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(viewHelpers);

// ===== Super Admin bypass =====
app.use('/admin', checkSuperAdmin);

// ===== Locals defaults (กัน ReferenceError ใน EJS) =====
app.use((req, res, next) => {
  const userAgent = String(req.headers['user-agent'] || '');
  const uaLower = userAgent.toLowerCase();
  const isLineAppDetected = uaLower.includes('line');
  const isMobileDeviceDetected = /mobile|android|iphone|ipad|ipod/.test(uaLower);
  const isLineMobileDetected = isLineAppDetected && isMobileDeviceDetected;
  const uaHasLineVersion = /Line\/\d+/i.test(userAgent);

  res.locals.title = res.locals.title ?? '';
  res.locals.active = res.locals.active ?? '';
  res.locals.noChrome = res.locals.noChrome ?? false;
  res.locals.user = res.locals.user ?? (req.session?.user || null);
  res.locals.isLineApp = res.locals.isLineApp ?? isLineAppDetected;
  res.locals.isMobileDevice = res.locals.isMobileDevice ?? isMobileDeviceDetected;
  res.locals.isLineMobile =
    res.locals.isLineMobile ?? (uaHasLineVersion ? true : isLineMobileDetected);
  res.locals.bodyVariant =
    res.locals.bodyVariant ?? (res.locals.isLineMobile ? 'line-app-view' : '');

  next();
});

// ===== DB =====
async function connectDatabase(retry = 0) {
  const maxRetries = Number(process.env.DB_CONNECT_RETRIES || 3);
  const delayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 3000);
  console.log('[DB] connecting... (attempt %d/%d)', retry + 1, maxRetries);
  try {
    await mongoose.connect(PRIMARY_MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    mongoReady = true;
    mongoErrorMessage = '';
    console.log('✅ Connected to MongoDB');
    setupDailyCron();
  } catch (err) {
    mongoReady = false;
    mongoErrorMessage = err?.message || 'Unknown MongoDB error';
    console.error('❌ MongoDB connection failed:', mongoErrorMessage);
    if (retry + 1 < maxRetries) {
      console.log('[DB] retrying in %dms...', delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return connectDatabase(retry + 1);
    }
  }
}

const DB_PASSTHROUGH_PREFIXES = ['/health', '/healthz', '/webhook', '/static'];

app.use((req, res, next) => {
  if (mongoReady) return next();
  if (DB_PASSTHROUGH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  const reason = mongoErrorMessage || 'กำลังเชื่อมต่อฐานข้อมูล...';
  return res.status(503).send(`Database unavailable: ${reason}`);
});

// ===== Health =====
app.get('/healthz', (req, res) => res.send('ok'));
// --- HEALTH CHECK ROUTE ---
app.get('/health', (req, res) => {
  console.log('✅ Health check pinged');
  res.status(200).send('OK');
});
app.get('/health/line', async (req, res) => {
  try {
    const info = await getBotInfo();
    res.json({ ok: true, info });
  } catch (err) {
    const status = err?.response?.status || 500;
    const code = err?.response?.data?.message || err?.code || err?.message || 'unknown';
    res.status(status).json({ ok: false, error: code });
  }
});

// ===== Routes =====
// Root: allow a simple 200 for platforms that expect success on '/'
const SIMPLE_ROOT_HEALTH = String(process.env.SIMPLE_ROOT_HEALTH || '').toLowerCase() === 'true';
app.get('/', (req, res) => {
  if (SIMPLE_ROOT_HEALTH) {
    return res.status(200).send('ok');
  }
  if (!req.session?.user) {
    const target = BASE_URL ? `${BASE_URL}/admin/login` : '/admin/login'; // updated to use BASE_URL
    return res.redirect(target);
  }
  res.render('dashboard', {
    title: 'Dashboard',
    active: 'dashboard',
    user: req.session.user,
  });
});

app.get('/liff-open-admin', (req, res) => {
  const rawTo = typeof req.query.to === 'string' ? req.query.to : '';
  const target = rawTo.startsWith('/') ? rawTo : '/admin';
  const liffId = process.env.LIFF_ID || process.env.LIFF_ID_AI || '';
  const baseUrl = BASE_URL || '';
  res.set('Cache-Control', 'no-store');
  res.send(`<!doctype html><html><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NILA · Admin Launcher</title></head>
  <body style="background:#05070d;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="text-align:center;max-width:360px;padding:24px;">
      <h1 style="font-size:1.6rem;margin-bottom:16px;">กำลังเปิด NILA Admin...</h1>
      <p style="opacity:0.75;">หากไม่เปิดอัตโนมัติ จะมีปุ่มให้กดภายในไม่กี่วินาที</p>
    </div>
    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    <script>
    (async () => {
      try {
        await liff.init({ liffId: "${liffId}" });
        const to = new URL(location.href).searchParams.get("to") || "${target}";
        liff.openWindow({ url: "${baseUrl}"+to, external: true });
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = "${baseUrl}"+to;
          link.textContent = "เปิดด้วยเบราว์เซอร์ภายนอก";
          link.style.display = "inline-block";
          link.style.marginTop = "24px";
          link.style.padding = "12px 18px";
          link.style.borderRadius = "12px";
          link.style.background = "rgba(99,102,241,0.25)";
          link.style.color = "#dbeafe";
          link.style.textDecoration = "none";
          document.body.appendChild(link);
        }, 2200);
      } catch (err) {
        console.error(err);
      }
    })();
    </script>
  </body></html>`);
});
app.use('/consent', consentRouter);
app.use('/line', lineFormsRouter);
app.use('/line', lineRouter);
app.use('/auth/line', authLineRouter);
app.use('/admin', adminRouter);
app.use(aiRouter);
app.use(mockDailySummaryRouter);
app.use(cdpRouter);
app.use(galleryRouter);

// 404
app.use((req, res) => res.status(404).send('Not Found'));

// Error fallback
app.use((err, req, res, next) => {
  console.error('EJS Error:', {
    path: req.path,
    query: req.query,
    userAgent: req.headers['user-agent'],
    lineMobile: /Line\/\d+/i.test(req.headers['user-agent'] || ''),
  });
  console.error(err);
  if (!res.headersSent) {
    return res.status(500).render('error', { title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถแสดงผลได้ชั่วคราว' });
  }
});

async function start() {
  await connectDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[BOOT] Failed to start application:', err);
});
