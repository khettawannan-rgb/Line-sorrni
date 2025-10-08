// project-root/src/services/procurement/pdfService.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import dayjs from 'dayjs';

import { resolvePdfPath, ensureStorageDirectories } from './storageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../..', 'views', 'pdf', 'po-template.ejs');

let browserInstance = null;
let puppeteerPromise;

async function loadPuppeteer() {
  if (!puppeteerPromise) {
    puppeteerPromise = import('puppeteer')
      .then((mod) => mod.default ?? mod)
      .catch((error) => {
        puppeteerPromise = undefined;
        const friendly = new Error(
          'Puppeteer dependency is not available. Install it or disable PDF generation before retrying.'
        );
        friendly.cause = error;
        throw friendly;
      });
  }
  return puppeteerPromise;
}

async function getBrowser() {
  if (browserInstance) return browserInstance;
  const puppeteer = await loadPuppeteer();
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const shutdown = async () => {
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        // ignore
      }
      browserInstance = null;
    }
  };
  process.on('exit', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return browserInstance;
}

export async function renderPurchaseOrderHtml(po, vendor, options = {}) {
  const locals = {
    po,
    vendor,
    dayjs,
    company: options.company || null,
    qrCode: options.qrCode || null,
  };
  return ejs.renderFile(TEMPLATE_PATH, locals, { async: true });
}

export async function generatePurchaseOrderPdf(po, vendor, options = {}) {
  if (!po) throw new Error('PO payload is required');
  if (!vendor) throw new Error('Vendor payload is required');

  ensureStorageDirectories();
  const html = await renderPurchaseOrderHtml(po, vendor, options);
  const { path: pdfPath, url } = resolvePdfPath(po.poNumber || `PO-${po._id}`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('screen');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
  });
  await page.close();

  return { pdfPath, pdfUrl: url };
}
