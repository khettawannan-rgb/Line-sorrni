import express from 'express';
import lineGuest from '../middleware/lineGuest.js';
import Company from '../models/Company.js';
import Member from '../models/Member.js';
import LineBinding from '../models/LineBinding.js';
import { sanitizeRedirect, escapeRegex } from '../utils/url.js';

const router = express.Router();

router.use(lineGuest);

function setSessionForMember(req, member) {
  if (!member) return;
  req.session.user = {
    username: member.displayName || 'LINE Member',
    memberId: member._id.toString(),
    role: member.role || 'member',
    companyId: member.companyId ? member.companyId.toString() : null,
    lineUserId: member.lineUserId || null,
  };
}

router.get('/pr', (req, res) => {
  res.redirect('/admin/pr?guest=1');
});

router.get('/po', (req, res) => {
  res.redirect('/admin/po?guest=1');
});

router.get('/bind', async (req, res) => {
  const lineUserId = (req.query.lineUserId || '').trim();
  const redirect = sanitizeRedirect(req.query.redirect || '/admin');
  if (!lineUserId) {
    res.locals.noChrome = true;
    return res.status(400).render('error', {
      title: 'ไม่พบข้อมูล LINE User',
      message: 'กรุณาเริ่มต้นใหม่จากปุ่มใน LINE Official Account',
      noChrome: true,
    });
  }
  const companies = await Company.find().sort({ name: 1 }).lean();
  res.locals.noChrome = true;
  res.render('line/bind', {
    title: 'เชื่อมบัญชี LINE กับบริษัท',
    noChrome: true,
    lineUserId,
    redirect,
    companies,
    form: {},
    errors: [],
  });
});

router.post('/bind', express.urlencoded({ extended: true }), async (req, res) => {
  const lineUserId = (req.body.lineUserId || '').trim();
  const redirect = sanitizeRedirect(req.body.redirect || '/admin');
  const companyId = (req.body.companyId || '').trim();
  const bindCode = (req.body.bindCode || '').trim();

  const errors = [];

  if (!lineUserId) errors.push('ไม่พบ LINE user id กรุณาเริ่มต้นจากปุ่มใน LINE');
  if (!companyId) errors.push('กรุณาเลือกบริษัท');
  if (!bindCode) errors.push('กรุณากรอกรหัสพนักงาน/รหัสยืนยัน');

  let company = null;
  if (companyId) {
    company = await Company.findById(companyId).lean();
    if (!company) errors.push('ไม่พบบริษัทที่เลือก');
  }

  let member = null;
  if (!errors.length) {
    const regex = new RegExp(`^${escapeRegex(bindCode)}$`, 'i');
    member = await Member.findOne({ companyId: company?._id || null, bindCode: regex });
    if (!member) {
      errors.push('ไม่พบสมาชิกที่ตรงกับรหัสนี้ กรุณาตรวจสอบอีกครั้ง');
    } else if (member.lineUserId && member.lineUserId !== lineUserId) {
      errors.push('บัญชี LINE นี้ถูกเชื่อมกับพนักงานคนอื่นแล้ว');
    }
  }

  if (errors.length) {
    res.locals.noChrome = true;
    const companies = await Company.find().sort({ name: 1 }).lean();
    return res.status(400).render('line/bind', {
      title: 'เชื่อมบัญชี LINE กับบริษัท',
      noChrome: true,
      lineUserId,
      redirect,
      companies,
      errors,
      form: { companyId, bindCode },
    });
  }

  member.lineUserId = lineUserId;
  member.active = true;
  await member.save();

  await LineBinding.findOneAndUpdate(
    { lineUserId, companyId: company._id },
    {
      memberId: member._id,
      role: member.role || 'member',
      status: 'active',
      lastLoginAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  setSessionForMember(req, member);

  res.redirect(redirect);
});

export default router;
