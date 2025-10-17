// project-root/src/lib/cooldown.js
// Tiny in-memory cooldown helper (mock). For production swap to Redis.

const store = new Map(); // key -> expiresAt (ms)

function keyOf(userId, scope) {
  return `${userId || 'unknown'}::${scope || 'default'}`;
}

export function withinCooldown(userId, scope, ms = 30000) {
  const k = keyOf(userId, scope);
  const now = Date.now();
  const expires = store.get(k) || 0;
  return expires > now;
}

export function touchCooldown(userId, scope, ms = 30000) {
  const k = keyOf(userId, scope);
  const now = Date.now();
  store.set(k, now + Math.max(0, Number(ms || 0)));
}

export default { withinCooldown, touchCooldown };

