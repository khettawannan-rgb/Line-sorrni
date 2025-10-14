export default function lineGuest(req, res, next) {
  res.locals.isGuest = true;
  next();
}
