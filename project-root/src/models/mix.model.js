const mongoose = require('mongoose');


const MixSchema = new mongoose.Schema(
{
companyId: { type: String, index: true },


productName: { type: String, index: true },
productCode: { type: String, index: true },


siteName: { type: String, index: true },
siteCode: { type: String, index: true },
},
{ timestamps: true }
);


// ถ้ามี productCode ให้ unique ตาม code (ต่อบริษัท)
MixSchema.index(
{ companyId: 1, productCode: 1 },
{ unique: true, partialFilterExpression: { productCode: { $exists: true, $ne: null } } }
);
// ถ้าไม่มี code ให้ unique ตาม productName + siteName (ต่อบริษัท)
MixSchema.index(
{ companyId: 1, productName: 1, siteName: 1 },
{ unique: true }
);


module.exports = mongoose.model('Mix', MixSchema);