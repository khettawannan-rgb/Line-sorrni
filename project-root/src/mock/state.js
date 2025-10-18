let index = 0;
export function nextReportIndex(total = 10) {
  const cur = index;
  index = (index + 1) % Math.max(1, total);
  return cur;
}
export function resetReportIndex() { index = 0; }
export function getReportIndex() { return index; }

export default { nextReportIndex, resetReportIndex, getReportIndex };

