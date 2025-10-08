import express from 'express';
const router = express.Router();

export function ensureLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}
export function injectUser(req, res, next) {
  res.locals.user = req.session?.user || null;
  next();
}
