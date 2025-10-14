import express from 'express';
import lineGuest from '../middleware/lineGuest.js';

const router = express.Router();

router.use(lineGuest);

router.get('/pr', (req, res) => {
  res.redirect('/admin/pr?guest=1');
});

router.get('/po', (req, res) => {
  res.redirect('/admin/po?guest=1');
});

export default router;
