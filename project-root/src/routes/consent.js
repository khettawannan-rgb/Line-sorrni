// project-root/src/routes/consent.js
import express from 'express';

import {
  verifyConsentToken,
  ensureConsentRecord,
  recordConsentDecision,
  fetchConsent,
} from '../services/consent.js';
import { getUserProfile } from '../services/line.js';

const router = express.Router();

function extractIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.trim()) {
    return header.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

router.get('/', async (req, res) => {
  const userId = String(req.query.user || '').trim();
  const token = String(req.query.token || '').trim();

  if (!userId || !token || !verifyConsentToken(userId, token)) {
    return res.status(400).render('consent_invalid', {
      title: 'ลิงก์ไม่ถูกต้อง',
      noChrome: true,
    });
  }

  let consent = await fetchConsent(userId);
  if (!consent) {
    consent = await ensureConsentRecord(userId);
  }

  let displayName = consent?.displayName || '';
  if (!displayName && consent) {
    try {
      const profile = await getUserProfile(userId);
      displayName = profile?.displayName || '';
      if (displayName) {
        consent.displayName = displayName;
        consent.pictureUrl = profile?.pictureUrl;
        consent.profile = profile;
        await consent.save();
      }
    } catch {}
  }

  return res.render('consent', {
    title: 'ยืนยันความยินยอม',
    noChrome: true,
    userId,
    token,
    consent,
    displayName,
  });
});

router.post('/', async (req, res) => {
  const { userId, token, decision } = req.body || {};
  if (!userId || !token || !verifyConsentToken(userId, token)) {
    return res.status(400).render('consent_invalid', {
      title: 'ลิงก์ไม่ถูกต้อง',
      noChrome: true,
    });
  }

  const accepted = decision === 'accept';
  let profile = null;
  if (accepted) {
    try {
      profile = await getUserProfile(userId);
    } catch (err) {
      console.warn('[CONSENT] getUserProfile on accept failed:', err.message);
    }
  }

  const consent = await recordConsentDecision(userId, accepted, {
    ip: extractIp(req),
    channel: 'web',
    profile,
  });

  return res.render('consent_result', {
    title: accepted ? 'ยินยอมสำเร็จ' : 'ปฏิเสธการยินยอม',
    noChrome: true,
    consent,
    accepted,
  });
});

export default router;
