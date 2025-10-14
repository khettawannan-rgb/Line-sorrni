import express from 'express';
import fetch from 'node-fetch';

import LineBinding from '../models/LineBinding.js';
import Member from '../models/Member.js';
import { sanitizeRedirect } from '../utils/url.js';

const router = express.Router();

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

router.get('/start', (req, res) => {
  const redirect = sanitizeRedirect(req.query.redirect || '/admin');
  const liffId = process.env.LIFF_ID || '';
  if (!liffId) {
    return res.status(500).render('error', {
      title: 'LINE Login misconfigured',
      message: 'ไม่พบ LIFF_ID ในการตั้งค่า โปรดติดต่อผู้ดูแลระบบ',
      noChrome: true,
    });
  }
  res.render('auth/line_start', {
    title: 'LINE Sign-in',
    liffId,
    redirect,
    noChrome: true,
  });
});

router.post('/verify', express.json(), async (req, res) => {
  try {
    const { id_token: idToken, redirect } = req.body || {};
    const redirectTarget = sanitizeRedirect(redirect || '/admin');

    if (!idToken) {
      return res.status(400).json({ ok: false, error: 'missing_id_token' });
    }
    const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
    if (!clientId) {
      return res.status(500).json({ ok: false, error: 'missing_channel_id' });
    }

    const verifyResp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });

    if (!verifyResp.ok) {
      const errorDetail = await verifyResp.text();
      console.error('[LINE][VERIFY] failed', errorDetail);
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    const payload = await verifyResp.json();
    const lineUserId = payload?.sub;
    if (!lineUserId) {
      return res.status(401).json({ ok: false, error: 'missing_sub' });
    }

    let binding = await LineBinding.findOne({ lineUserId, status: 'active' }).populate('memberId');

    if (binding && binding.memberId) {
      const member = binding.memberId;
      if (!member.lineUserId) {
        member.lineUserId = lineUserId;
      }
      member.active = true;
      await member.save();

      binding.lastLoginAt = new Date();
      binding.role = member.role || binding.role;
      await binding.save();

      setSessionForMember(req, member);
      return res.json({ ok: true, redirect: redirectTarget });
    }

    const fallbackMember = await Member.findOne({ lineUserId }).exec();
    if (fallbackMember) {
      fallbackMember.active = true;
      await fallbackMember.save();
      binding = await LineBinding.findOneAndUpdate(
        { lineUserId, companyId: fallbackMember.companyId || null },
        {
          memberId: fallbackMember._id,
          role: fallbackMember.role || 'member',
          status: 'active',
          lastLoginAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      setSessionForMember(req, fallbackMember);
      return res.json({ ok: true, redirect: redirectTarget });
    }

    return res.json({ ok: false, bindRequired: true, lineUserId, redirect: redirectTarget });
  } catch (err) {
    console.error('[LINE][VERIFY] unexpected error', err);
    return res.status(500).json({ ok: false, error: 'verify_failed' });
  }
});

export default router;
