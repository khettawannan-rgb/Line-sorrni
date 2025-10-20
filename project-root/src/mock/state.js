let index = 0;
const map = new Map();
export function nextReportIndex(total = 10) {
  const cur = index;
  index = (index + 1) % Math.max(1, total);
  return cur;
}
export function resetReportIndex() { index = 0; }
export function getReportIndex() { return index; }

// Generic key-based rotation helpers (for other mock menus)
export function nextIndex(key, total = 10) {
  const cur = map.has(key) ? map.get(key) : 0;
  map.set(key, (cur + 1) % Math.max(1, total));
  return cur;
}
export function getIndex(key) { return map.has(key) ? map.get(key) : 0; }
export function resetIndex(key) { map.set(key, 0); }

export default { nextReportIndex, resetReportIndex, getReportIndex, nextIndex, getIndex, resetIndex };
