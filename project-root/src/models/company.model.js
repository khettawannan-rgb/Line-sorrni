const mongoose = require('mongoose');


const CompanySchema = new mongoose.Schema(
{
code: { type: String, unique: true, index: true },
name: { type: String },
},
{ timestamps: true }
);


module.exports = mongoose.model('Company', CompanySchema);