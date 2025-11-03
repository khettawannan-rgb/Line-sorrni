// project-root/src/routes/games.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Prize from '../models/Prize.js';

const router = Router();

// POST /games/allocate-prize
// Allocates a prize by reserving 1 unit, weighted by remaining availability
const FALLBACK_PRIZES = [
  { name: 'หมอน', weight: 1 },
  { name: 'ผ้าห่ม', weight: 1 },
  { name: 'ปากกา', weight: 24 },
  { name: 'ดินสอ', weight: 16 },
  { name: 'กระเป๋าปากกา', weight: 2 },
  { name: 'แผ่นรองเมาส์', weight: 1 },
  { name: 'สมุดแมวมาลี', weight: 12 },
  { name: 'สมุดโน้ต', weight: 9 },
  { name: 'กระเป๋าแคร์แบร์', weight: 2 },
  { name: 'Post-it', weight: 10 },
  { name: 'สติกเกอร์', weight: 10 },
];

function weightedPick(items) {
  const total = items.reduce((s, x) => s + (Number(x.weight) || 0), 0) || 0;
  let r = Math.random() * (total || 1);
  for (const it of items) { r -= Number(it.weight) || 0; if (r <= 0) return it; }
  return items[0];
}

router.post('/games/allocate-prize', async (req, res) => {
  try {
    const ready = mongoose.connection?.readyState === 1;

    if (!ready) {
      const pick = weightedPick(FALLBACK_PRIZES);
      return res.json({ ok: true, assigned: pick.name, prize: { id: null, name: pick.name }, simulated: true });
    }

    const prizes = await Prize.find({}).lean();
    const choices = [];
    for (const p of prizes) {
      const available = Math.max(Number(p.total || 0) - Number(p.reserved || 0) - Number(p.used || 0), 0);
      if (available > 0) choices.push({ id: String(p._id), name: p.name, weight: available });
    }
    if (!choices.length) {
      // Fallback to in-memory list so the game always completes
      const pick = weightedPick(FALLBACK_PRIZES);
      return res.json({ ok: true, assigned: pick.name, prize: { id: null, name: pick.name }, simulated: true });
    }

    const total = choices.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    let pick = choices[0];
    for (const c of choices) { if ((r -= c.weight) <= 0) { pick = c; break; } }

    const updated = await Prize.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(pick.id), $expr: { $lt: ['$reserved', { $subtract: ['$total', '$used'] }] } },
      { $inc: { reserved: 1 } },
      { new: true }
    );
    if (!updated) return res.status(200).json({ ok: true, assigned: picked.name, prize: { id: picked.id, name: picked.name }, simulated: true });

    return res.json({ ok: true, assigned: picked.name, prize: { id: picked.id, name: picked.name } });
  } catch (err) {
    // If DB error occurs, still provide a simulated prize
    try {
      const pick = weightedPick(FALLBACK_PRIZES);
      return res.status(200).json({ ok: true, assigned: pick.name, prize: { id: null, name: pick.name }, simulated: true });
    } catch {}
    return res.status(200).json({ ok: false, error: err?.message || 'unavailable' });
  }
});

export default router;
