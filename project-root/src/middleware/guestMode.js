export default function guestMode(req, res, next) {
  const isGuest = Boolean(req.query.guest) || !req.session?.user;
  res.locals.isGuest = isGuest;
  res.locals.redirectTo = req.originalUrl;
  if (!res.locals.user) {
    res.locals.user = req.session?.user || null;
  }
  next();
}
