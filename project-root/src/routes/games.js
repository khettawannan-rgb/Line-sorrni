// project-root/src/routes/games.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Prize from '../models/Prize.js';

const router = Router();

// POST /games/allocate-prize
// Allocates a prize by reserving 1 unit, weighted by remaining availability
router.post('/games/allocate-prize', async (req, res) => {
  try {
    const prizes = await Prize.find({}).lean();
    const choices = [];
    for (const p of prizes) {
      const available = Math.max(Number(p.total || 0) - Number(p.reserved || 0) - Number(p.used || 0), 0);
      if (available > 0) choices.push({ id: String(p._id), name: p.name, weight: available });
    }
    if (!choices.length) return res.status(200).json({ ok: false, error: 'no_prize_available' });

    const total = choices.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    let pick = choices[0];
    for (const c of choices) { if ((r -= c.weight) <= 0) { pick = c; break; } }

    const updated = await Prize.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(pick.id), $expr: { $lt: ['$reserved', { $subtract: ['$total', '$used'] }] } },
      { $inc: { reserved: 1 } },
      { new: true }
    );
    if (!updated) return res.status(200).json({ ok: false, error: 'conflict_retry' });

    return res.json({ ok: true, assigned: pick.name, prize: { id: pick.id, name: pick.name } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'failed' });
  }
});

export default router;

