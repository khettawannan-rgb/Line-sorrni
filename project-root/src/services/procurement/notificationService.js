// project-root/src/services/procurement/notificationService.js
import { pushLineMessage } from '../line.js';
import { STATUS_LABELS } from './constants.js';

const RECIPIENTS = String(process.env.PROCUREMENT_NOTIFY_LINE_IDS || '')
  .split(/[\s,]+/)
  .map((id) => id.trim())
  .filter(Boolean);

export async function notifyPoStatus(po) {
  if (!RECIPIENTS.length || !po) return;

  const statusLabel = STATUS_LABELS[po.status] || po.status;
  const lines = [
    `📦 สถานะใบสั่งซื้อ ${po.poNumber}: ${statusLabel}`,
    `ผู้จัดจำหน่าย: ${po.vendorId?.name || '-'}`,
    `ยอดรวม: ${Number(po.totalAmount || 0).toLocaleString('th-TH', { style: 'currency', currency: po.currency || 'THB' })}`,
  ];

  if (po.tracking?.trackingNumber) {
    lines.push(`Tracking: ${po.tracking.trackingNumber} (${po.tracking.carrier || 'ไม่ระบุ'})`);
  }
  if (po.pdfUrl) {
    lines.push(`เอกสาร PDF: ${po.pdfUrl}`);
  }

  const message = lines.join('\n');
  await Promise.allSettled(RECIPIENTS.map((userId) => pushLineMessage(userId, message)));
}
