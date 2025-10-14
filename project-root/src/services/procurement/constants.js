// project-root/src/services/procurement/constants.js
export const PR_STATUSES = Object.freeze({
  DRAFT: 'draft',
  WAITING_APPROVAL: 'waiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
});

export const PO_STATUSES = Object.freeze({
  DRAFT: 'draft',
  APPROVED: 'approved',
  SENT: 'sent',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
});

export const STATUS_LABELS = Object.freeze({
  [PR_STATUSES.DRAFT]: 'Draft',
  [PR_STATUSES.WAITING_APPROVAL]: 'Waiting Approval',
  [PR_STATUSES.APPROVED]: 'Approved',
  [PR_STATUSES.REJECTED]: 'Rejected',
  [PR_STATUSES.CLOSED]: 'Closed',
  [PO_STATUSES.DRAFT]: 'Draft',
  [PO_STATUSES.APPROVED]: 'Approved',
  [PO_STATUSES.SENT]: 'Sent',
  [PO_STATUSES.RECEIVED]: 'Received',
  [PO_STATUSES.CANCELLED]: 'Cancelled',
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
