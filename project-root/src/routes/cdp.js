// project-root/src/routes/cdp.js
import { Router } from 'express';
import { track } from '../lib/cdp.js';

const router = Router();

router.post('/cdp/track', (req, res) => {
  try {
    const { name, payload } = req.body || {};
    if (!name) return res.status(200).json({ ok: false, error: 'missing name' });
    track(String(name), typeof payload === 'object' ? payload : { raw: payload });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Always 200 to avoid client overlays
    return res.status(200).json({ ok: false, error: err?.message || 'failed' });
  }
});

export default router;
