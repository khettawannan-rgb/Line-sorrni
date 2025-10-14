// project-root/src/services/procurement/workflowService.js
import { approveRequisition, getRequisitionById } from './prService.js';
import { createPurchaseOrder } from './poService.js';
import { PO_STATUSES } from './constants.js';

export async function approvePrAndCreatePo(prId, actor = 'system', options = {}) {
  const remark = options.remark || '';
  const pr = await approveRequisition(prId, actor, remark);
  if (!pr.vendorId) {
    throw new Error('PR must have a vendor before creating PO');
  }
  if (pr.linkedPurchaseOrder) {
    return { pr, po: null, message: 'PR already linked to a PO' };
  }

  const poPayload = {
    prId: pr._id,
    vendorId: pr.vendorId,
    currency: pr.currency || 'THB',
    items: pr.lines.map((line) => ({
      description: line.description,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      uom: line.uom,
      notes: line.notes,
    })),
    taxAmount: pr.taxAmount,
    totalAmount: pr.total,
    shippingFee: 0,
    paymentTerms: options.paymentTerms || 'Credit 30 days',
    incoterms: options.incoterms || 'FOB',
    shipping: options.shipping || { shipTo: '', address: '', contact: '' },
    remarks: `Auto-generated from ${pr.prNumber}`,
    status: PO_STATUSES.DRAFT,
  };

  const po = await createPurchaseOrder(poPayload, actor);
  return { pr: await getRequisitionById(pr._id), po };
}
