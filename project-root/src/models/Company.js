import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Bangkok' },
  dailyTime: { type: String, default: '09:00' }, // HH:mm
  sourceCompanyIds: { type: [String], default: [] },
  sourceCompanyNames: { type: [String], default: [] },
}, { timestamps: true });

const Company = mongoose.model('Company', CompanySchema);
export default Company;
