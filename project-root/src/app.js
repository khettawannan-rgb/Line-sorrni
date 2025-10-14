import 'dotenv/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import cors from 'cors';
import expressLayouts from 'express-ejs-layouts';
import bodyParser from 'body-parser';
import morgan from 'morgan';

import adminRouter from './routes/admin.js';
import webhookRouter from './routes/webhook.js';
import consentRouter from './routes/consent.js';
import lineFormsRouter from './routes/lineForms.js';
import { setupDailyCron } from './jobs/scheduler.js';

const PORT = Number(process.env.PORT || 10000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/line-erp-notifier';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const LIFF_ID = process.env.LIFF_ID || '';
const TRUSTED_ORIGINS = [BASE_URL, 'https://liff.line.me'].filter(Boolean);

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

// ===== Webhook (raw body) =====
app.use(['/webhook/line', '/webhook'], webhookRouter);

// ===== Parsers =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===== Session =====
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// ===== Locals defaults (กัน ReferenceError ใน EJS) =====
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.title = '';
  res.locals.active = '';
  res.locals.noChrome = false;   // <— สำคัญ
  next();
});

// ===== DB =====
async function connectDatabase() {
  console.log('[DB] connecting...');
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    mongoReady = true;
    mongoErrorMessage = '';
    console.log('✅ Connected to MongoDB');
    setupDailyCron();
  } catch (err) {
    mongoReady = false;
    mongoErrorMessage = err?.message || 'Unknown MongoDB error';
    console.error('❌ MongoDB connection failed:', mongoErrorMessage);
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
app.get('/healthz', (req, res) => res.send('OK'));
// --- HEALTH CHECK ROUTE ---
app.get('/health', (req, res) => {
  console.log('✅ Health check pinged');
  res.status(200).send('OK');
});

// ===== Routes =====
app.get('/', (req, res) => {
  if (!req.session?.user) {
    return res.redirect('/admin/login');
  }
  res.render('dashboard', {
    title: 'Dashboard',
    active: 'dashboard',
    user: req.session.user,
  });
});

app.get('/liff-open-admin', (req, res) => {
  if (!LIFF_ID) {
    return res.status(500).send('LIFF_ID is not configured');
  }
  const rawTo = typeof req.query.to === 'string' ? req.query.to : '';
  const safePath = rawTo.startsWith('/') ? rawTo : '/admin';
  res.render('liff_open_admin', {
    title: 'NILA · Admin Launcher',
    liffId: LIFF_ID,
    targetPath: safePath,
    baseUrl: BASE_URL || '',
  });
});
app.use('/consent', consentRouter);
app.use('/line', lineFormsRouter);
app.use('/admin', adminRouter);

// 404
app.use((req, res) => res.status(404).send('Not Found'));

// Error fallback
app.use((err, req, res, next) => {
  console.error('[APP][ERR]', err);
  if (!res.headersSent) return res.status(500).send('Internal Server Error');
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
