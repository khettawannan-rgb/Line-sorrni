// project-root/src/services/procurement/emailService.js
import path from 'node:path';

import { now } from './helpers.js';

let transporter = null;
let nodemailerPromise;

async function loadNodemailer() {
  if (!nodemailerPromise) {
    nodemailerPromise = import('nodemailer')
      .then((mod) => mod.default ?? mod)
      .catch((error) => {
        nodemailerPromise = undefined;
        const friendly = new Error(
          'Nodemailer dependency is not available. Install it or disable purchase order email sending before retrying.'
        );
        friendly.cause = error;
        throw friendly;
      });
  }
  return nodemailerPromise;
}

async function getTransport() {
  if (transporter) return transporter;
  const nodemailer = await loadNodemailer();

  const host = process.env.PROCUREMENT_EMAIL_HOST;
  const port = Number(process.env.PROCUREMENT_EMAIL_PORT || 587);
  const secure = String(process.env.PROCUREMENT_EMAIL_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.PROCUREMENT_EMAIL_USER;
  const pass = process.env.PROCUREMENT_EMAIL_PASS;

  if (host && user) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  } else {
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    console.warn('[EMAIL] using stream transport (set PROCUREMENT_EMAIL_* env for real sending)');
  }

  return transporter;
}

export async function sendPurchaseOrderEmail({ po, vendor, pdfPath, pdfUrl }) {
  if (!po || !vendor) throw new Error('po and vendor are required');
  const to = vendor.email || vendor.contact?.email;
  if (!to) throw new Error('Vendor email is missing');

  const sender = process.env.PROCUREMENT_EMAIL_FROM || process.env.PROCUREMENT_EMAIL_USER || 'noreply@example.com';
  const subject = `[PO] ${po.poNumber} - ${vendor.name}`;

  const html = `
    <p>เรียน ${vendor.contact?.name || vendor.name},</p>
    <p>กรุณาพบใบสั่งซื้อฉบับใหม่หมายเลข <strong>${po.poNumber}</strong> จากทีมจัดซื้อ</p>
    <ul>
      <li>ยอดรวม: ${Number(po.totalAmount || 0).toLocaleString('th-TH', { style: 'currency', currency: po.currency || 'THB' })}</li>
      <li>วันคาดว่าจะจัดส่ง: ${po.expectedDeliveryDate ? now(po.expectedDeliveryDate).format('DD MMM YYYY') : '-'}</li>
      <li>ติดต่อกลับ: ${sender}</li>
    </ul>
    <p>ดาวน์โหลดเอกสาร PDF: <a href="${pdfUrl}">${pdfUrl}</a></p>
    <p>ขอบคุณครับ</p>
  `;

  const attachments = [];
  if (pdfPath) {
    attachments.push({
      filename: path.basename(pdfPath),
      path: pdfPath,
      contentType: 'application/pdf',
    });
  }

  const transport = await getTransport();
  const info = await transport.sendMail({
    from: sender,
    to,
    subject,
    html,
    attachments,
  });

  console.log('[EMAIL] purchase order sent', info.messageId || info.envelope);
  return info;
}
