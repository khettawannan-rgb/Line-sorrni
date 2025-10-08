// project-root/src/services/procurement/constants.js
export const PR_STATUSES = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const PO_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  IN_DELIVERY: 'in_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

export const STATUS_LABELS = Object.freeze({
  [PR_STATUSES.DRAFT]: 'ฉบับร่าง',
  [PR_STATUSES.PENDING_APPROVAL]: 'รออนุมัติ',
  [PR_STATUSES.APPROVED]: 'อนุมัติแล้ว',
  [PR_STATUSES.REJECTED]: 'ถูกปฏิเสธ',
  [PR_STATUSES.CANCELLED]: 'ยกเลิก',
  [PO_STATUSES.PENDING]: 'รอดำเนินการ',
  [PO_STATUSES.APPROVED]: 'อนุมัติแล้ว',
  [PO_STATUSES.IN_DELIVERY]: 'กำลังจัดส่ง',
  [PO_STATUSES.DELIVERED]: 'จัดส่งสำเร็จ',
  [PO_STATUSES.CANCELLED]: 'ยกเลิก',
});

export const PR_NUMBER_PREFIX = 'PR';
export const PO_NUMBER_PREFIX = 'PO';

export const PROCUREMENT_CHANNELS = Object.freeze({
  EMAIL: 'email',
  LINE: 'line',
});

export const DEFAULT_NOTIFICATION_ROLES = Object.freeze([
  'procurement',
  'warehouse',
  'approver',
]);
