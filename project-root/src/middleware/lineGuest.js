export default function lineGuest(req, res, next) {
  if (!req.session?.user) {
    res.locals.isGuest = true;
  }
  next();
}
