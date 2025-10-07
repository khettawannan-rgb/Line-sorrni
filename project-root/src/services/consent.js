// project-root/src/services/consent.js
import crypto from 'node:crypto';

import LineConsent from '../models/lineConsent.model.js';
import { getUserProfile } from './line.js';

const CONSENT_SECRET =
  process.env.CONSENT_SIGNING_SECRET || process.env.SESSION_SECRET || 'dev-consent-secret';
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');
const PROMPT_COOLDOWN_MIN = Number(process.env.CONSENT_PROMPT_COOLDOWN_MIN || 360);

export function signConsentToken(userId) {
  return crypto.createHmac('sha256', CONSENT_SECRET).update(String(userId || '')).digest('hex');
}

export function verifyConsentToken(userId, token) {
  if (!userId || !token) return false;
  const expected = signConsentToken(userId);
  const provided = String(token);
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function buildConsentUrl(userId) {
  const token = signConsentToken(userId);
  return `${PUBLIC_BASE_URL}/consent?user=${encodeURIComponent(userId)}&token=${token}`;
}

export function shouldPromptConsent(consentDoc) {
  if (!consentDoc) return true;
  if (consentDoc.status === 'granted') return false;
  const last = consentDoc.lastPromptedAt ? consentDoc.lastPromptedAt.getTime() : 0;
  const now = Date.now();
  const cooldown = PROMPT_COOLDOWN_MIN * 60 * 1000;
  return now - last > cooldown;
}

export async function ensureConsentRecord(userId) {
  if (!userId) return null;
  let consent = await LineConsent.findOne({ userId });
  if (!consent) {
    let profile = null;
    try {
      profile = await getUserProfile(userId);
    } catch (err) {
      console.warn('[CONSENT] fetch profile failed', err.message);
    }

    consent = await LineConsent.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          status: 'pending',
          displayName: profile?.displayName,
          pictureUrl: profile?.pictureUrl,
          profile,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  return consent;
}

export async function updateConsentPrompted(userId, opts = {}) {
  if (!userId) return null;
  return LineConsent.findOneAndUpdate(
    { userId },
    {
      $set: {
        lastPromptedAt: new Date(),
        ...(opts.displayName ? { displayName: opts.displayName } : {}),
        ...(opts.pictureUrl ? { pictureUrl: opts.pictureUrl } : {}),
        ...(opts.profile ? { profile: opts.profile } : {}),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export async function recordConsentDecision(userId, accepted, meta = {}) {
  if (!userId) throw new Error('userId is required');
  const now = new Date();
  const status = accepted ? 'granted' : 'revoked';

  const setUpdate = {
    status,
    ...(accepted
      ? { grantedAt: now, revokedAt: null }
      : { revokedAt: now }),
  };

  if (accepted && meta.profile) {
    setUpdate.displayName = meta.profile.displayName || meta.displayName;
    setUpdate.pictureUrl = meta.profile.pictureUrl || meta.pictureUrl;
    setUpdate.profile = meta.profile;
  }

  const doc = await LineConsent.findOneAndUpdate(
    { userId },
    {
      $set: setUpdate,
      $push: {
        history: {
          status,
          at: now,
          channel: meta.channel || 'web',
          ip: meta.ip,
          note: meta.note,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return doc;
}

export async function fetchConsent(userId) {
  if (!userId) return null;
  return LineConsent.findOne({ userId });
}

export async function adminSetConsentStatus(userId, status, meta = {}) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('ต้องระบุ LINE userId');

  const normalized = String(status || '').toLowerCase();
  const allowed = ['pending', 'granted', 'revoked'];
  if (!allowed.includes(normalized)) {
    throw new Error('สถานะไม่ถูกต้อง');
  }

  const now = new Date();
  const setUpdate = {
    status: normalized,
    ...(normalized === 'granted'
      ? { grantedAt: now, revokedAt: null }
      : normalized === 'revoked'
        ? { revokedAt: now }
        : { grantedAt: null, revokedAt: null }),
    ...(meta.displayName ? { displayName: meta.displayName } : {}),
    ...(meta.pictureUrl ? { pictureUrl: meta.pictureUrl } : {}),
    ...(meta.profile ? { profile: meta.profile } : {}),
  };

  const pushHistory = {
    status: normalized,
    at: now,
    channel: meta.channel || 'admin',
    ip: meta.ip,
    note: meta.note,
  };

  const update = {
    $set: setUpdate,
    $push: { history: pushHistory },
    $setOnInsert: { userId: uid },
  };

  return LineConsent.findOneAndUpdate(
    { userId: uid },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}
