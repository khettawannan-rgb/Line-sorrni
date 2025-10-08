// project-root/src/models/PurchaseOrder.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const OrderItemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'ตัน' },
    unitPrice: { type: Number, default: 0 },
    currency: { type: String, default: 'THB' },
    lineTotal: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const StatusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    actor: { type: String, default: 'system' },
    remark: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeliveryProofSchema = new Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, default: '' },
    note: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, required: true, unique: true },
    prId: { type: Schema.Types.ObjectId, ref: 'PurchaseRequisition', index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'in_delivery', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    items: { type: [OrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'THB' },
    paymentTerms: { type: String, default: 'Credit 30 days' },
    expectedDeliveryDate: { type: Date, default: null },
    tracking: {
      trackingNumber: { type: String, default: '' },
      carrier: { type: String, default: '' },
      deliveredAt: { type: Date, default: null },
      deliveryProof: { type: [DeliveryProofSchema], default: [] },
    },
    pdfPath: { type: String, default: '' },
    pdfUrl: { type: String, default: '' },
    emailLog: {
      sent: { type: Boolean, default: false },
      sentAt: { type: Date, default: null },
      provider: { type: String, default: '' },
      messageId: { type: String, default: '' },
      error: { type: String, default: '' },
    },
    lineNotifications: {
      lastStatusNotified: { type: String, default: '' },
      notifiedAt: { type: Date, default: null },
    },
    remarks: { type: String, default: '' },
    statusHistory: { type: [StatusHistorySchema], default: [] },
  },
  { timestamps: true, strict: true }
);

PurchaseOrderSchema.index(
  { vendorId: 1, createdAt: -1 },
  { name: 'by_vendor_created' }
);
PurchaseOrderSchema.index(
  { status: 1, expectedDeliveryDate: 1 },
  { name: 'by_status_delivery' }
);

const PurchaseOrder = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
export default PurchaseOrder;
