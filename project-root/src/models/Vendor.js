// project-root/src/models/Vendor.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ContactSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    lineId: { type: String, trim: true },
  },
  { _id: false }
);

const VendorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, index: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, default: '' },
    productCategories: { type: [String], default: [], index: true },
    defaultCurrency: { type: String, default: 'THB' },
    isActive: { type: Boolean, default: true, index: true },
    contact: ContactSchema,
    notes: { type: String, default: '' },
    meta: {
      preferredLeadTimeDays: { type: Number, default: 3 },
      paymentTerms: { type: String, default: 'Credit 30 days' },
    },
  },
  { timestamps: true, strict: true }
);

VendorSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'th', strength: 2 }, name: 'uniq_vendor_name' }
);
VendorSchema.index({ email: 1 }, { sparse: true, name: 'by_vendor_email' });
VendorSchema.index({ isActive: 1, name: 1 }, { name: 'by_vendor_active' });

const Vendor = mongoose.model('Vendor', VendorSchema);
export default Vendor;
