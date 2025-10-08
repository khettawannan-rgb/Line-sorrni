// project-root/src/services/procurement/storageService.js
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const STORAGE_ROOT = process.env.PROCUREMENT_STORAGE_ROOT || path.resolve('storage');
const ATTACHMENT_DIR = path.join(STORAGE_ROOT, 'procurement', 'attachments');
const PO_PDF_DIR = process.env.PO_PDF_DIR || path.join(STORAGE_ROOT, 'po');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureStorageDirectories() {
  ensureDir(ATTACHMENT_DIR);
  ensureDir(PO_PDF_DIR);
}

export function saveAttachment(buffer, originalName) {
  ensureStorageDirectories();
  const ext = path.extname(originalName || '').slice(0, 10).replace(/[^.a-zA-Z0-9]/g, '');
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const targetPath = path.join(ATTACHMENT_DIR, filename);
  fs.writeFileSync(targetPath, buffer);
  return { filename, path: targetPath, url: `/storage/procurement/attachments/${filename}` };
}

export function resolvePdfPath(poNumber) {
  ensureDir(PO_PDF_DIR);
  const safePo = poNumber.replace(/[^A-Za-z0-9_-]/g, '-');
  const filename = `${safePo}.pdf`;
  const targetPath = path.join(PO_PDF_DIR, filename);
  return { filename, path: targetPath, url: `/storage/po/${filename}` };
}
